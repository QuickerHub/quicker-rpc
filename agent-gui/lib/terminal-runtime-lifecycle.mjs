import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { RUNTIME_VERSION } from "../terminal-runtime/config.mjs";
import { isProcessAlive, killProcessTree } from "./qkrpc-serve-lifecycle.mjs";

const STATE_FILE = "terminal-runtime.json";
const DEFAULT_TERMINAL_PORT = 6022;

/** @typedef {{ pid: number; port?: number; ownerPid: number; startedAt: number }} TerminalRuntimeState */

export function terminalRuntimeStatePath(agentGuiRoot) {
  return join(agentGuiRoot, ".runtime", STATE_FILE);
}

/** @returns {TerminalRuntimeState | null} */
export function readTerminalRuntimeState(agentGuiRoot) {
  const path = terminalRuntimeStatePath(agentGuiRoot);
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

/** @param {TerminalRuntimeState} state */
export function writeTerminalRuntimeState(agentGuiRoot, state) {
  const path = terminalRuntimeStatePath(agentGuiRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state)}\n`, "utf8");
}

export function clearTerminalRuntimeState(agentGuiRoot) {
  const path = terminalRuntimeStatePath(agentGuiRoot);
  if (!existsSync(path)) return;
  try {
    rmSync(path, { force: true });
  } catch {
    // ignore
  }
}

export function resolveTerminalRuntimeRoot(agentGuiRoot) {
  if (agentGuiRoot && existsSync(join(agentGuiRoot, "terminal-runtime", "server.mjs"))) {
    return agentGuiRoot;
  }
  return process.cwd();
}

export function resolveTerminalPort() {
  const raw =
    process.env.QUICKER_TERMINAL_PORT?.trim()
    ?? process.env.AGENT_GUI_TERMINAL_PORT?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return DEFAULT_TERMINAL_PORT;
}

function normalizeBase(url) {
  return url.replace(/\/$/, "");
}

/** @typedef {{ ok: boolean; runtimeVersion?: string; protocolVersion?: string }} TerminalRuntimeHealth */

/** @param {string} base */
export async function fetchTerminalRuntimeHealth(base, timeoutMs = 3000) {
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

/** @param {string} base */
export async function checkTerminalRuntimeHealth(base, timeoutMs = 3000) {
  const health = await fetchTerminalRuntimeHealth(base, timeoutMs);
  return health.ok === true;
}

/** @param {TerminalRuntimeHealth} health */
export function isTerminalRuntimeVersionCurrent(health) {
  return health.ok === true && health.runtimeVersion === RUNTIME_VERSION;
}

async function waitForTerminalRuntimeHealth(base, maxMs = 30_000) {
  const deadline = Date.now() + maxMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    if (await checkTerminalRuntimeHealth(base, 1200)) return;
    attempt += 1;
    const delayMs = attempt <= 8 ? 60 : attempt <= 20 ? 120 : 250;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`terminal runtime did not become ready at ${base}/health`);
}

/**
 * Stop orphaned terminal runtime from a prior agent-gui session.
 * @param {string} agentGuiRoot
 */
export function reconcileStaleTerminalRuntime(agentGuiRoot) {
  const state = readTerminalRuntimeState(agentGuiRoot);
  if (!state) return false;

  const serveAlive = isProcessAlive(state.pid);
  const ownerAlive = isProcessAlive(state.ownerPid);

  if (serveAlive && !ownerAlive) {
    killProcessTree(state.pid);
    clearTerminalRuntimeState(agentGuiRoot);
    return true;
  }

  if (!serveAlive) {
    clearTerminalRuntimeState(agentGuiRoot);
  }

  return false;
}

/**
 * @param {string} agentGuiRoot
 * @param {import('node:child_process').ChildProcess} child
 * @param {{ port?: number }} meta
 */
export function trackTerminalRuntimeChild(agentGuiRoot, child, meta = {}) {
  const pid = child.pid;
  if (!pid) return;

  writeTerminalRuntimeState(agentGuiRoot, {
    pid,
    ownerPid: process.pid,
    startedAt: Date.now(),
    port: meta.port,
  });

  child.on("exit", () => {
    const current = readTerminalRuntimeState(agentGuiRoot);
    if (current?.pid === pid) {
      clearTerminalRuntimeState(agentGuiRoot);
    }
  });
}

/**
 * @param {string} agentGuiRoot
 * @param {import('node:child_process').ChildProcess | null | undefined} child
 */
export function stopTrackedTerminalRuntime(agentGuiRoot, child) {
  if (child?.pid && !child.killed) {
    killProcessTree(child.pid);
  }
  clearTerminalRuntimeState(agentGuiRoot);
}

/**
 * Ensure Node terminal-runtime is listening (reuse or spawn).
 * @param {string} [agentGuiRoot]
 * @param {string} host
 */
export async function ensureTerminalRuntime(agentGuiRoot, host) {
  if (process.env.AGENT_GUI_SKIP_TERMINAL_RUNTIME === "1") {
    return null;
  }

  const runtimeRoot = resolveTerminalRuntimeRoot(agentGuiRoot ?? process.cwd());
  const port = resolveTerminalPort();
  const base = `http://${host}:${port}`;

  const health = await fetchTerminalRuntimeHealth(base);
  if (health.ok && isTerminalRuntimeVersionCurrent(health)) {
    console.log(`terminal: reusing runtime ${health.runtimeVersion} at ${base}/health`);
    return null;
  }

  if (health.ok && !isTerminalRuntimeVersionCurrent(health)) {
    console.log(
      `terminal: stale runtime ${health.runtimeVersion ?? "unknown"} (want ${RUNTIME_VERSION}) — restarting`,
    );
    const { killListenerOnPort } = await import("./browser-runtime-lifecycle.mjs");
    killListenerOnPort(port);
    clearTerminalRuntimeState(runtimeRoot);
    await new Promise((r) => setTimeout(r, 400));
  }

  reconcileStaleTerminalRuntime(runtimeRoot);

  const entry = join(runtimeRoot, "terminal-runtime", "server.mjs");
  if (!existsSync(entry)) {
    console.warn(
      "terminal: terminal-runtime/server.mjs not found — skip auto-start",
    );
    return null;
  }

  console.log(`terminal: starting Node terminal-runtime at ${base}`);
  const child = spawn(
    process.execPath,
    [entry, "--host", host, "--port", String(port)],
    {
      cwd: runtimeRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        QUICKER_TERMINAL_HOST: host,
        QUICKER_TERMINAL_PORT: String(port),
      },
    },
  );

  child.stdout?.on("data", (chunk) => {
    const line = chunk.toString().trimEnd();
    if (line) console.log(`[terminal] ${line}`);
  });
  child.stderr?.on("data", (chunk) => {
    const line = chunk.toString().trimEnd();
    if (line) console.error(`[terminal] ${line}`);
  });
  child.on("error", (err) => {
    console.error(`[terminal] failed to start: ${err.message}`);
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null && signal !== "SIGTERM") {
      console.error(
        `terminal runtime exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
      );
    }
  });

  if (!child.pid) {
    console.warn("terminal: could not spawn terminal-runtime");
    return null;
  }

  trackTerminalRuntimeChild(runtimeRoot, child, { port });

  try {
    await waitForTerminalRuntimeHealth(base);
    console.log(`terminal: ready at ${base}/health`);
    return child;
  } catch (err) {
    console.warn(
      `terminal: ${err instanceof Error ? err.message : String(err)} — embedded terminal may be unavailable`,
    );
    stopTrackedTerminalRuntime(runtimeRoot, child);
    return null;
  }
}
