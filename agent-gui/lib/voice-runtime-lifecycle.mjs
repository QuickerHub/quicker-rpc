import { execSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { isProcessAlive, killProcessTree } from "./qkrpc-serve-lifecycle.mjs";

const STATE_FILE = "voice-runtime.json";
const DEFAULT_VOICE_PORT = 6016;

/** @typedef {{ pid: number; port?: number; ownerPid: number; startedAt: number }} VoiceRuntimeState */

export function voiceRuntimeStatePath(agentGuiRoot) {
  return join(agentGuiRoot, ".runtime", STATE_FILE);
}

/** @returns {VoiceRuntimeState | null} */
export function readVoiceRuntimeState(agentGuiRoot) {
  const path = voiceRuntimeStatePath(agentGuiRoot);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const pid = Number(raw?.pid);
    const ownerPid = Number(raw?.ownerPid);
    if (!Number.isInteger(pid) || pid <= 0) return null;
    if (!Number.isInteger(ownerPid) || ownerPid <= 0) return null;
    return {
      pid,
      ownerPid,
      startedAt: Number(raw?.startedAt) || 0,
      port: Number.isInteger(Number(raw?.port)) ? Number(raw.port) : undefined,
    };
  } catch {
    return null;
  }
}

/** @param {VoiceRuntimeState} state */
export function writeVoiceRuntimeState(agentGuiRoot, state) {
  const path = voiceRuntimeStatePath(agentGuiRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state)}\n`, "utf8");
}

export function clearVoiceRuntimeState(agentGuiRoot) {
  const path = voiceRuntimeStatePath(agentGuiRoot);
  if (!existsSync(path)) return;
  try {
    rmSync(path, { force: true });
  } catch {
    // ignore
  }
}

export function resolveVoicePort() {
  const raw =
    process.env.QUICKER_VOICE_PORT?.trim()
    ?? process.env.AGENT_GUI_VOICE_PORT?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return DEFAULT_VOICE_PORT;
}

function normalizeBase(url) {
  return url.replace(/\/$/, "");
}

/** @param {string} base e.g. http://127.0.0.1:6016 */
export async function checkVoiceRuntimeHealth(base, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${normalizeBase(base)}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return false;
    const body = await res.json();
    if (body?.ok !== true) return false;
    if (process.env.AGENT_GUI_VOICE_ALLOW_STUB === "1") return true;
    return body?.modelLoaded === true && body?.modelId !== "stub";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForVoiceRuntimeHealth(base, maxMs = 45_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await checkVoiceRuntimeHealth(base, 2500)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`voice runtime did not become ready at ${base}/health`);
}

/** Verify quicker-voice-v1 WebSocket session.start works (not just /health). */
export async function checkVoiceRuntimeProtocol(base, timeoutMs = 3000) {
  const url = new URL(normalizeBase(base));
  const wsUrl = `ws://${url.hostname}:${url.port || resolveVoicePort()}/`;
  const sessionId = crypto.randomUUID();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    let ws;
    try {
      ws = new WebSocket(wsUrl, ["quicker-voice-v1"]);
    } catch {
      finish(false);
      return;
    }

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "session.start",
          sessionId,
          language: "zh-CN",
          streaming: false,
          sampleRate: 16_000,
          channels: 1,
          encoding: "pcm_s16le",
        }),
      );
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === "session.started" && msg.sessionId === sessionId) {
          ws.close();
          finish(true);
        }
      } catch {
        // ignore malformed frames
      }
    };
    ws.onerror = () => finish(false);
    ws.onclose = () => finish(false);
  });
}

/** @param {number} port */
function killListenerOnPort(port) {
  if (process.platform === "win32") {
    try {
      const out = execSync(
        `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess)"`,
        { encoding: "utf8", windowsHide: true },
      ).trim();
      for (const line of out.split(/\r?\n/)) {
        const pid = Number(line.trim());
        if (Number.isInteger(pid) && pid > 0) {
          killProcessTree(pid);
        }
      }
    } catch {
      // ignore
    }
    return;
  }

  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" }).trim();
    for (const line of out.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (Number.isInteger(pid) && pid > 0) {
        killProcessTree(pid);
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Stop orphaned voice runtime from a prior agent-gui session.
 * @param {string} agentGuiRoot
 */
export function reconcileStaleVoiceRuntime(agentGuiRoot) {
  const state = readVoiceRuntimeState(agentGuiRoot);
  if (!state) return false;

  const serveAlive = isProcessAlive(state.pid);
  const ownerAlive = isProcessAlive(state.ownerPid);

  if (serveAlive && !ownerAlive) {
    killProcessTree(state.pid);
    clearVoiceRuntimeState(agentGuiRoot);
    return true;
  }

  if (!serveAlive) {
    clearVoiceRuntimeState(agentGuiRoot);
  }

  return false;
}

/**
 * @param {string} agentGuiRoot
 * @param {import('node:child_process').ChildProcess} child
 * @param {{ port?: number }} meta
 */
export function trackVoiceRuntimeChild(agentGuiRoot, child, meta = {}) {
  const pid = child.pid;
  if (!pid) return;

  writeVoiceRuntimeState(agentGuiRoot, {
    pid,
    ownerPid: process.pid,
    startedAt: Date.now(),
    port: meta.port,
  });

  child.on("exit", () => {
    const current = readVoiceRuntimeState(agentGuiRoot);
    if (current?.pid === pid) {
      clearVoiceRuntimeState(agentGuiRoot);
    }
  });
}

/**
 * @param {string} agentGuiRoot
 * @param {import('node:child_process').ChildProcess | null | undefined} child
 */
export function stopTrackedVoiceRuntime(agentGuiRoot, child) {
  if (child?.pid && !child.killed) {
    killProcessTree(child.pid);
  }
  clearVoiceRuntimeState(agentGuiRoot);
}

/**
 * Dev-only: ensure quicker-voice-runtime is listening (reuse or spawn via uv).
 * @param {string} agentGuiRoot
 * @param {string} host
 * @returns {Promise<import('node:child_process').ChildProcess | null>}
 */
export async function ensureVoiceRuntime(agentGuiRoot, host) {
  if (process.env.AGENT_GUI_SKIP_VOICE_RUNTIME === "1") {
    return null;
  }

  const port = resolveVoicePort();
  const base = `http://${host}:${port}`;

  if (await checkVoiceRuntimeHealth(base)) {
    if (await checkVoiceRuntimeProtocol(base)) {
      console.log(`voice: reusing runtime at ${base}/health`);
      return null;
    }
    console.warn(
      `voice: ${base}/health is up but WebSocket protocol check failed — restarting runtime`,
    );
    reconcileStaleVoiceRuntime(agentGuiRoot);
    killListenerOnPort(port);
    await new Promise((r) => setTimeout(r, 500));
  } else {
    reconcileStaleVoiceRuntime(agentGuiRoot);
  }

  const runtimeDir = join(agentGuiRoot, "..", "voice-asr-runtime");
  if (!existsSync(join(runtimeDir, "pyproject.toml"))) {
    console.warn(
      "voice: voice-asr-runtime not found — skip auto-start (set AGENT_GUI_SKIP_VOICE_RUNTIME=1 to silence)",
    );
    return null;
  }

  console.log(`voice: starting quicker-voice-runtime at ${base} (uv run)`);
  const child = spawn(
    "uv",
    ["run", "quicker-voice-runtime", "--host", host, "--port", String(port)],
    {
      cwd: runtimeDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        QUICKER_VOICE_HOST: host,
        QUICKER_VOICE_PORT: String(port),
        QUICKER_VOICE_AUTO_DOWNLOAD_MODEL:
          process.env.QUICKER_VOICE_AUTO_DOWNLOAD_MODEL ?? "1",
      },
    },
  );

  child.stdout?.on("data", (chunk) => {
    const line = chunk.toString().trimEnd();
    if (line) console.log(`[voice] ${line}`);
  });
  child.stderr?.on("data", (chunk) => {
    const line = chunk.toString().trimEnd();
    if (line) console.error(`[voice] ${line}`);
  });
  child.on("error", (err) => {
    console.error(`[voice] failed to start: ${err.message}`);
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null && signal !== "SIGTERM") {
      console.error(
        `voice runtime exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
      );
    }
  });

  if (!child.pid) {
    console.warn(
      "voice: could not spawn uv — install uv and voice-asr-runtime deps, or run pnpm voice:dev-server manually",
    );
    return null;
  }

  trackVoiceRuntimeChild(agentGuiRoot, child, { port });

  try {
    await waitForVoiceRuntimeHealth(base);
    if (!(await checkVoiceRuntimeProtocol(base))) {
      throw new Error("WebSocket protocol check failed after start");
    }
    console.log(`voice: ready at ${base}/health`);
    return child;
  } catch (err) {
    console.warn(
      `voice: ${err instanceof Error ? err.message : String(err)} — Composer voice may be unavailable`,
    );
    stopTrackedVoiceRuntime(agentGuiRoot, child);
    return null;
  }
}
