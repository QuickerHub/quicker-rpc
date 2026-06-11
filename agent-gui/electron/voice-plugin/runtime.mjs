import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { killChildTree } from "../backend-spawn.mjs";
import { voicePluginRoot } from "../quicker-agent-paths.mjs";
import { isVoiceAsrFullyInstalled } from "./install.mjs";
import { devRuntimeDir } from "./paths-dev.mjs";
import { emitDesktopEvent } from "./events.mjs";
import { readVoicePluginSettings, voiceWsPort } from "./settings.mjs";
import { attachStdioBridge } from "./stdio-bridge.mjs";
import {
  endVoiceRuntimeStart,
  tryBeginVoiceRuntimeStart,
} from "./state.mjs";

const DEFAULT_VOICE_WS_HOST = "127.0.0.1";
const VOICE_RUNTIME_READY_WAIT_MS = 60_000;

/** @type {import('node:child_process').ChildProcess | null} */
let runtimeChild = null;

/** @type {ReturnType<typeof attachStdioBridge> | null} */
let stdioBridge = null;

export function getStdioBridge() {
  return stdioBridge;
}

function modelTypeForId(modelId) {
  return modelId === "lightweight" ? "paraformer-zh" : "sensevoice";
}

function resolveVoiceModelDir(root) {
  const settings = readVoicePluginSettings(root);
  const sub = settings.modelId === "lightweight" ? "paraformer-zh" : "sensevoice";
  const dir = join(root, "models", sub);
  return existsSync(dir) ? dir : null;
}

function resolveVoiceExecutionProvider(gpuAcceleration) {
  if (!gpuAcceleration) return "cpu";
  if (process.platform === "win32") return "directml";
  if (process.platform === "darwin") return "coreml";
  return "cuda";
}

export function voiceRuntimeModelReady(health) {
  if (!health?.ok || !health.ready || !health.modelLoaded) return false;
  const id = String(health.modelId ?? "").trim();
  return id.length > 0 && id.toLowerCase() !== "stub";
}

function childStillRunning(child) {
  if (!child?.pid) return false;
  try {
    process.kill(child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function reconcileChild() {
  if (runtimeChild && !childStillRunning(runtimeChild)) {
    runtimeChild = null;
    stdioBridge = null;
  }
}

export function isVoiceRuntimeOwnedRunning() {
  reconcileChild();
  return runtimeChild !== null && childStillRunning(runtimeChild);
}

export async function fetchVoiceRuntimeHealth(port = voiceWsPort()) {
  const empty = {
    ok: false,
    protocolVersion: 1,
    runtimeVersion: null,
    modelId: null,
    modelLoaded: false,
    ready: false,
    executionProvider: null,
  };
  if (stdioBridge) {
    return stdioBridge.buildHealthDto();
  }
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3_000);
    const res = await fetch(`http://${DEFAULT_VOICE_WS_HOST}:${port}/health`, {
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return empty;
    const body = await res.json();
    return {
      ok: body.ok === true,
      protocolVersion: Number(body.protocolVersion ?? 1),
      runtimeVersion: body.runtimeVersion ?? null,
      modelId: body.modelId ?? null,
      modelLoaded: body.modelLoaded === true,
      ready: body.ready === true,
      executionProvider: body.executionProvider ?? null,
    };
  } catch {
    return empty;
  }
}

export async function isVoiceRuntimeRunning(port = voiceWsPort()) {
  if (isVoiceRuntimeOwnedRunning()) {
    if (stdioBridge?.isReady() && stdioBridge.modelLoaded()) return true;
    const health = await fetchVoiceRuntimeHealth(port);
    return voiceRuntimeModelReady(health);
  }
  const health = await fetchVoiceRuntimeHealth(port);
  return voiceRuntimeModelReady(health);
}

function buildRuntimeEnv(root, port) {
  const settings = readVoicePluginSettings(root);
  const modelDir = resolveVoiceModelDir(root);
  const env = {
    ...process.env,
    QUICKER_VOICE_HOST: DEFAULT_VOICE_WS_HOST,
    QUICKER_VOICE_PORT: String(port),
    QUICKER_VOICE_PROVIDER: resolveVoiceExecutionProvider(settings.gpuAcceleration),
    QUICKER_VOICE_NUM_THREADS: "4",
    QUICKER_VOICE_AUTO_DOWNLOAD_MODEL: "0",
  };
  if (modelDir) {
    env.QUICKER_VOICE_MODEL_DIR = modelDir;
    env.QUICKER_VOICE_MODEL_TYPE = modelTypeForId(settings.modelId);
  }
  return env;
}

function attachBridgeToChild(child) {
  if (!child.stdin || !child.stdout) {
    stdioBridge = null;
    return;
  }
  stdioBridge = attachStdioBridge({
    stdin: child.stdin,
    stdout: child.stdout,
    onPartial: (sessionId, text) => {
      emitDesktopEvent("voice-ipc-partial", { sessionId, text });
    },
  });
}

function spawnInstalledRuntime(root, port, { transport = "tcp" } = {}) {
  const exe = join(root, "runtime", "quicker-voice-runtime.exe");
  if (!existsSync(exe)) {
    throw new Error(`Runtime 不存在：${exe}`);
  }
  const env = buildRuntimeEnv(root, port);
  const args =
    transport === "stdio"
      ? ["--transport", "stdio"]
      : ["--host", DEFAULT_VOICE_WS_HOST, "--port", String(port)];
  const stdio =
    transport === "stdio" ? ["pipe", "pipe", "ignore"] : "ignore";
  const child = spawn(exe, args, {
    cwd: root,
    env,
    stdio,
    windowsHide: true,
  });
  runtimeChild = child;
  if (transport === "stdio") {
    attachBridgeToChild(child);
  } else {
    stdioBridge = null;
  }
  child.on("exit", () => {
    if (runtimeChild === child) {
      runtimeChild = null;
      stdioBridge = null;
    }
  });
  return child;
}

function spawnDevRuntime(devDir, port) {
  const env = buildRuntimeEnv(devDir, port);
  const args = [
    "run",
    "--directory",
    devDir,
    "quicker-voice-runtime",
    "--host",
    DEFAULT_VOICE_WS_HOST,
    "--port",
    String(port),
  ];
  const child = spawn("uv", args, {
    cwd: devDir,
    env,
    stdio: "ignore",
    windowsHide: true,
  });
  runtimeChild = child;
  stdioBridge = null;
  child.on("exit", () => {
    if (runtimeChild === child) runtimeChild = null;
  });
  return child;
}

async function waitVoiceRuntimeReady(port, maxMs = VOICE_RUNTIME_READY_WAIT_MS) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    if (stdioBridge) {
      try {
        await stdioBridge.waitReady(Math.min(5_000, maxMs));
        if (stdioBridge.modelLoaded()) return;
      } catch {
        // keep polling
      }
    }
    const health = await fetchVoiceRuntimeHealth(port);
    if (voiceRuntimeModelReady(health)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `语音 Runtime 已启动但识别模型未加载（${DEFAULT_VOICE_WS_HOST}:${port}/health）。请在设置中重新安装语音组件。`,
  );
}

export async function startVoiceRuntime() {
  reconcileChild();
  const root = voicePluginRoot();
  const port = voiceWsPort(root);

  if (await isVoiceRuntimeRunning(port)) {
    return;
  }

  if (!isVoiceAsrFullyInstalled(root)) {
    const devDir = devRuntimeDir();
    if (!devDir) {
      throw new Error("请先安装语音插件");
    }
    spawnDevRuntime(devDir, port);
    await waitVoiceRuntimeReady(port);
    return;
  }

  spawnInstalledRuntime(root, port, { transport: "tcp" });
  await waitVoiceRuntimeReady(port);
}

export async function startVoiceRuntimeBlocking() {
  await startVoiceRuntime();
}

export function stopVoiceRuntime() {
  if (runtimeChild) {
    killChildTree(runtimeChild);
    runtimeChild = null;
    stdioBridge = null;
  }
}

export function shutdownVoiceRuntime() {
  stopVoiceRuntime();
}

export function toPcmBuffer(pcm) {
  if (Buffer.isBuffer(pcm)) return pcm;
  if (pcm instanceof Uint8Array) return Buffer.from(pcm);
  if (Array.isArray(pcm)) return Buffer.from(pcm);
  if (pcm && typeof pcm === "object" && pcm.type === "Buffer" && Array.isArray(pcm.data)) {
    return Buffer.from(pcm.data);
  }
  throw new Error("invalid pcm payload");
}
