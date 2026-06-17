import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isProcessAlive, killProcessTree } from "./qkrpc-serve-lifecycle.mjs";

/** Keep in sync with cursor-sdk-runtime/config.mjs (dev-only child process). */
const RUNTIME_VERSION = "1.0.0";

const STATE_FILE = "cursor-sdk-runtime.json";
const DEFAULT_CURSOR_SDK_PORT = 6023;

/** @typedef {{ pid: number; port?: number; ownerPid: number; startedAt: number }} CursorSdkRuntimeState */

export function cursorSdkRuntimeStatePath(agentGuiRoot) {
  return join(agentGuiRoot, ".runtime", STATE_FILE);
}

/** @returns {CursorSdkRuntimeState | null} */
export function readCursorSdkRuntimeState(agentGuiRoot) {
  const path = cursorSdkRuntimeStatePath(agentGuiRoot);
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

/** @param {CursorSdkRuntimeState} state */
export function writeCursorSdkRuntimeState(agentGuiRoot, state) {
  const path = cursorSdkRuntimeStatePath(agentGuiRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state)}\n`, "utf8");
}

export function clearCursorSdkRuntimeState(agentGuiRoot) {
  const path = cursorSdkRuntimeStatePath(agentGuiRoot);
  if (!existsSync(path)) return;
  try {
    rmSync(path, { force: true });
  } catch {
    // ignore
  }
}

export function resolveCursorSdkRuntimeRoot(agentGuiRoot) {
  if (
    agentGuiRoot
    && existsSync(join(agentGuiRoot, "cursor-sdk-runtime", "server.mjs"))
  ) {
    return agentGuiRoot;
  }
  return process.cwd();
}

export function resolveCursorSdkRuntimeDir(agentGuiRoot) {
  return join(resolveCursorSdkRuntimeRoot(agentGuiRoot), "cursor-sdk-runtime");
}

export function resolveCursorSdkPort() {
  const raw =
    process.env.QUICKER_CURSOR_SDK_PORT?.trim()
    ?? process.env.AGENT_GUI_CURSOR_SDK_PORT?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return DEFAULT_CURSOR_SDK_PORT;
}

function normalizeBase(url) {
  return url.replace(/\/$/, "");
}

/** @typedef {{ ok: boolean; runtimeVersion?: string; protocolVersion?: string }} CursorSdkRuntimeHealth */

/** @param {string} base */
export async function fetchCursorSdkRuntimeHealth(base, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${normalizeBase(base)}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false };
    const body = await res.json();
    return {
      ok: body?.ok === true,
      runtimeVersion:
        typeof body?.runtimeVersion === "string" ? body.runtimeVersion : undefined,
      protocolVersion:
        typeof body?.protocolVersion === "string" ? body.protocolVersion : undefined,
    };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** @param {CursorSdkRuntimeHealth} health */
export function isCursorSdkRuntimeVersionCurrent(health) {
  return health.ok === true && health.runtimeVersion === RUNTIME_VERSION;
}

async function waitForCursorSdkRuntimeHealth(base, maxMs = 60_000) {
  const deadline = Date.now() + maxMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    const health = await fetchCursorSdkRuntimeHealth(base, 2500);
    if (health.ok) return health;
    attempt += 1;
    await new Promise((resolve) => {
      setTimeout(resolve, Math.min(250 + attempt * 120, 1500));
    });
  }
  throw new Error(`cursor-sdk-runtime did not become healthy at ${base}/health`);
}

/** @param {string} agentGuiRoot */
export function reconcileStaleCursorSdkRuntime(agentGuiRoot) {
  const state = readCursorSdkRuntimeState(agentGuiRoot);
  if (!state) return;
  if (isProcessAlive(state.pid) && state.ownerPid === process.pid) {
    return;
  }
  if (isProcessAlive(state.pid)) {
    killProcessTree(state.pid);
  }
  clearCursorSdkRuntimeState(agentGuiRoot);
}

/**
 * @param {string} agentGuiRoot
 * @param {import("node:child_process").ChildProcess} child
 * @param {{ port: number }} meta
 */
export function trackCursorSdkRuntimeChild(agentGuiRoot, child, meta) {
  if (!child.pid) return;
  writeCursorSdkRuntimeState(agentGuiRoot, {
    pid: child.pid,
    ownerPid: process.pid,
    startedAt: Date.now(),
    port: meta.port,
  });
}

/**
 * @param {string} agentGuiRoot
 * @param {import("node:child_process").ChildProcess | null | undefined} child
 */
export function stopTrackedCursorSdkRuntime(agentGuiRoot, child) {
  if (child?.pid && !child.killed) {
    killProcessTree(child.pid);
  }
  clearCursorSdkRuntimeState(agentGuiRoot);
}

/** @param {string} runtimeDir */
export function ensureCursorSdkRuntimeDeps(runtimeDir) {
  const sdkEntry = join(runtimeDir, "node_modules", "@cursor", "sdk", "package.json");
  if (existsSync(sdkEntry)) {
    return true;
  }

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  console.log(`cursor-sdk: installing runtime deps in ${runtimeDir}`);
  const result = spawnSync(npmCmd, ["install", "--omit=dev"], {
    cwd: runtimeDir,
    stdio: "inherit",
    windowsHide: true,
    env: process.env,
  });
  return result.status === 0 && existsSync(sdkEntry);
}

/**
 * Ensure cursor-sdk-runtime is listening (reuse or spawn).
 * @param {string} [agentGuiRoot]
 * @param {string} host
 */
export async function ensureCursorSdkRuntime(agentGuiRoot, host) {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }
  if (process.env.AGENT_GUI_SKIP_CURSOR_SDK_RUNTIME === "1") {
    return null;
  }

  const runtimeRoot = resolveCursorSdkRuntimeRoot(agentGuiRoot ?? process.cwd());
  const runtimeDir = join(runtimeRoot, "cursor-sdk-runtime");
  const port = resolveCursorSdkPort();
  const base = `http://${host}:${port}`;

  const health = await fetchCursorSdkRuntimeHealth(base);
  if (health.ok && isCursorSdkRuntimeVersionCurrent(health)) {
    console.log(`cursor-sdk: reusing runtime ${health.runtimeVersion} at ${base}/health`);
    return null;
  }

  if (health.ok && !isCursorSdkRuntimeVersionCurrent(health)) {
    console.log(
      `cursor-sdk: stale runtime ${health.runtimeVersion ?? "unknown"} (want ${RUNTIME_VERSION}) — restarting`,
    );
    const { killListenerOnPort } = await import("./browser-runtime-lifecycle.mjs");
    killListenerOnPort(port);
    clearCursorSdkRuntimeState(runtimeRoot);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  reconcileStaleCursorSdkRuntime(runtimeRoot);

  const entry = join(runtimeDir, "server.mjs");
  if (!existsSync(entry)) {
    console.warn("cursor-sdk: cursor-sdk-runtime/server.mjs not found — skip auto-start");
    return null;
  }

  if (!ensureCursorSdkRuntimeDeps(runtimeDir)) {
    console.warn("cursor-sdk: failed to install runtime dependencies");
    return null;
  }

  console.log(`cursor-sdk: starting Node cursor-sdk-runtime at ${base}`);
  const child = spawn(
    process.execPath,
    [entry, "--host", host, "--port", String(port)],
    {
      cwd: runtimeDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        QUICKER_CURSOR_SDK_HOST: host,
        QUICKER_CURSOR_SDK_PORT: String(port),
      },
    },
  );

  child.stdout?.on("data", (chunk) => {
    const line = chunk.toString().trimEnd();
    if (line) console.log(`[cursor-sdk] ${line}`);
  });
  child.stderr?.on("data", (chunk) => {
    const line = chunk.toString().trimEnd();
    if (line) console.error(`[cursor-sdk] ${line}`);
  });
  child.on("error", (err) => {
    console.error(`[cursor-sdk] failed to start: ${err.message}`);
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null && signal !== "SIGTERM") {
      console.error(
        `cursor-sdk runtime exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
      );
    }
  });

  if (!child.pid) {
    console.warn("cursor-sdk: could not spawn cursor-sdk-runtime");
    return null;
  }

  trackCursorSdkRuntimeChild(runtimeRoot, child, { port });

  try {
    await waitForCursorSdkRuntimeHealth(base);
    console.log(`cursor-sdk: ready at ${base}/health`);
    return child;
  } catch (err) {
    console.warn(
      `cursor-sdk: ${err instanceof Error ? err.message : String(err)} — Cursor SDK page may be unavailable`,
    );
    stopTrackedCursorSdkRuntime(runtimeRoot, child);
    return null;
  }
}
