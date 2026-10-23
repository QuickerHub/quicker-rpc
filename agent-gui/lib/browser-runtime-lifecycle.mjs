import { runtimeHttpOrigin } from "./runtime-http-origin.mjs";
import { requestOwnedChildTreeStop } from "./owned-child-stop.mjs";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { RUNTIME_VERSION } from "../browser-runtime/config.mjs";
import { resolveBrowserRuntimeRoot } from "./browser-runtime-root.mjs";
import { isProcessAlive } from "./qkrpc-serve-lifecycle.mjs";

const STATE_FILE = "browser-runtime.json";
const DEFAULT_BROWSER_PORT = 6017;
/** @type {Map<import('node:child_process').ChildProcess, { root: string; pid: number; ownerPid: number; onExit: () => void; stopping?: Promise<void> }>} */
const ownedBrowserChildren = new Map();

/** @typedef {{ pid: number; port?: number; ownerPid: number; startedAt: number }} BrowserRuntimeState */

export function browserRuntimeStatePath(agentGuiRoot) {
  return join(process.env.AGENT_GUI_RUNTIME_STATE_DIR?.trim() || join(agentGuiRoot, ".runtime"), STATE_FILE);
}

/** @returns {BrowserRuntimeState | null} */
export function readBrowserRuntimeState(agentGuiRoot) {
  const path = browserRuntimeStatePath(agentGuiRoot);
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

/** @param {BrowserRuntimeState} state */
export function writeBrowserRuntimeState(agentGuiRoot, state) {
  const path = browserRuntimeStatePath(agentGuiRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state)}\n`, "utf8");
}

export function clearBrowserRuntimeState(agentGuiRoot) {
  const path = browserRuntimeStatePath(agentGuiRoot);
  if (!existsSync(path)) return;
  try {
    rmSync(path, { force: true });
  } catch {
    // ignore
  }
}

export function resolveBrowserPort() {
  const raw =
    process.env.QUICKER_BROWSER_PORT?.trim()
    ?? process.env.AGENT_GUI_BROWSER_PORT?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return DEFAULT_BROWSER_PORT;
}

function normalizeBase(url) {
  return url.replace(/\/$/, "");
}

/** @typedef {{ ok: boolean; runtimeOwner?: string; runtimeVersion?: string; protocolVersion?: string }} BrowserRuntimeHealth */

/** @param {string} base e.g. http://127.0.0.1:6017 */
export async function fetchBrowserRuntimeHealth(
  base,
  timeoutMs = 3000,
  abortSignal,
) {
  abortSignal?.throwIfAborted();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${normalizeBase(base)}/health`, {
      method: "GET",
      signal: abortSignal ? AbortSignal.any([abortSignal, controller.signal]) : controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    abortSignal?.throwIfAborted();
    if (!res.ok) return { ok: false };
    const body = await res.json();
    abortSignal?.throwIfAborted();
    return {
      ok: body?.ok === true,
      runtimeOwner: typeof body?.runtimeOwner === "string" ? body.runtimeOwner : undefined,
      runtimeVersion:
        typeof body?.runtimeVersion === "string" ? body.runtimeVersion : undefined,
      protocolVersion:
        typeof body?.protocolVersion === "string" ? body.protocolVersion : undefined,
    };
  } catch {
    abortSignal?.throwIfAborted();
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** @param {string} base e.g. http://127.0.0.1:6017 */
export async function checkBrowserRuntimeHealth(base, timeoutMs = 3000) {
  const health = await fetchBrowserRuntimeHealth(base, timeoutMs);
  return health.ok === true && (!process.env.QUICKER_AGENT_RUNTIME_OWNER || health.runtimeOwner === process.env.QUICKER_AGENT_RUNTIME_OWNER);
}

/** @param {BrowserRuntimeHealth} health */
export function isBrowserRuntimeVersionCurrent(health) {
  return health.ok === true && health.runtimeVersion === RUNTIME_VERSION
    && (!process.env.QUICKER_AGENT_RUNTIME_OWNER || health.runtimeOwner === process.env.QUICKER_AGENT_RUNTIME_OWNER);
}

async function waitForBrowserRuntimeHealth(base, maxMs = 45_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await checkBrowserRuntimeHealth(base, 2500)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`browser runtime did not become ready at ${base}/health`);
}

/** Port occupancy is not ownership. Callers must stop their retained child handle. */
export function killListenerOnPort(port) {
  throw new Error(`Refusing to stop an unowned listener on port ${port}`);
}

/**
 * Stop orphaned browser runtime from a prior agent-gui session.
 * @param {string} agentGuiRoot
 */
export function reconcileStaleBrowserRuntime(agentGuiRoot) {
  const state = readBrowserRuntimeState(agentGuiRoot);
  if (!state) return false;

  const serveAlive = isProcessAlive(state.pid);
  const ownerAlive = isProcessAlive(state.ownerPid);

  // A prior owner's PID may have been recycled. Only retained child handles may stop it.
  if (serveAlive && !ownerAlive) return false;

  if (!serveAlive) {
    clearBrowserRuntimeState(agentGuiRoot);
  }

  return false;
}

/**
 * @param {string} agentGuiRoot
 * @param {import('node:child_process').ChildProcess} child
 * @param {{ port?: number }} meta
 */
export function trackBrowserRuntimeChild(agentGuiRoot, child, meta = {}) {
  const pid = child.pid;
  if (!pid || child.exitCode != null || child.signalCode != null || ownedBrowserChildren.has(child)) return;
  const root = resolve(agentGuiRoot);
  const ownerPid = process.pid;
  const owned = { root, pid, ownerPid, onExit: () => {
    finishOwnedBrowserChild(child, owned);
  } };
  ownedBrowserChildren.set(child, owned);
  child.once("exit", owned.onExit);

  writeBrowserRuntimeState(root, {
    pid,
    ownerPid,
    startedAt: Date.now(),
    port: meta.port,
  });

}

function clearOwnedBrowserState(owned) {
  const current = readBrowserRuntimeState(owned.root);
  if (current?.pid === owned.pid && current.ownerPid === owned.ownerPid) {
    clearBrowserRuntimeState(owned.root);
  }
}

function finishOwnedBrowserChild(child, owned) {
  if (ownedBrowserChildren.get(child) !== owned) return;
  ownedBrowserChildren.delete(child);
  child.removeListener("exit", owned.onExit);
  clearOwnedBrowserState(owned);
}

function stopOwnedBrowserChild(agentGuiRoot, child) {
  const owned = child && ownedBrowserChildren.get(child);
  if (!owned || owned.root !== resolve(agentGuiRoot)) return Promise.resolve();
  if (owned.stopping) return owned.stopping;
  let resolveStop, rejectStop;
  const pending = new Promise((done, fail) => { resolveStop = done; rejectStop = fail; });
  owned.stopping = pending;
  const reset = () => { if (owned.stopping === pending) owned.stopping = undefined; };
  void pending.then(reset, reset);
  let timer;
  let settled = false;
  const cleanupWait = () => { clearTimeout(timer); child.removeListener("exit", exited); };
  const exited = () => {
    if (settled) return;
    settled = true;
    cleanupWait();
    finishOwnedBrowserChild(child, owned);
    resolveStop();
  };
  const failed = (error) => {
    if (settled) return;
    settled = true;
    cleanupWait();
    rejectStop(error);
  };
  child.once("exit", exited);
  if (child.exitCode != null || child.signalCode != null) exited();
  else if (child.pid !== owned.pid) failed(new Error("Owned browser runtime child identity changed"));
  else {
    timer = setTimeout(() => failed(new Error(`Owned browser runtime ${owned.pid} did not exit within 2000ms`)), 2000);
    void requestOwnedChildTreeStop(child).then((accepted) => {
      if (!accepted) failed(new Error(`Failed to stop owned browser runtime ${owned.pid}`));
    }, failed);
  }
  return pending;
}

/**
 * @param {string} agentGuiRoot
 * @param {import('node:child_process').ChildProcess | null | undefined} child
 */
export function stopTrackedBrowserRuntime(agentGuiRoot, child) {
  void stopOwnedBrowserChild(agentGuiRoot, child).catch((error) => console.error("[browser runtime stop]", error));
}

/** Stop only children spawned and retained by this process; reused runtimes are not owned. */
export async function stopOwnedBrowserRuntimes() {
  const results = await Promise.allSettled([...ownedBrowserChildren].map(([child, owned]) => stopOwnedBrowserChild(owned.root, child)));
  const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
  if (errors.length) throw new AggregateError(errors, "Owned browser runtime shutdown failed");
}

/**
 * Ensure Node browser-runtime is listening (reuse or spawn).
 * @param {string} [agentGuiRoot]
 * @param {string} host
 * @returns {Promise<import('node:child_process').ChildProcess | null>}
 */
export async function ensureBrowserRuntime(agentGuiRoot, host) {
  if (process.env.AGENT_GUI_SKIP_BROWSER_RUNTIME === "1") {
    return null;
  }

  const runtimeRoot = resolveBrowserRuntimeRoot(agentGuiRoot ?? process.cwd());
  const port = resolveBrowserPort();
  const base = runtimeHttpOrigin(host, port);

  const health = await fetchBrowserRuntimeHealth(base);
  if (health.ok && isBrowserRuntimeVersionCurrent(health)
    && (!process.env.QUICKER_AGENT_RUNTIME_OWNER || health.runtimeOwner === process.env.QUICKER_AGENT_RUNTIME_OWNER)) {
    console.log(`browser: reusing runtime ${health.runtimeVersion} at ${base}/health`);
    return null;
  }

  if (health.ok && (!isBrowserRuntimeVersionCurrent(health)
    || process.env.QUICKER_AGENT_RUNTIME_OWNER && health.runtimeOwner !== process.env.QUICKER_AGENT_RUNTIME_OWNER)) {
    throw new Error("browser runtime port is owned by another service or an incompatible runtime");
  }

  reconcileStaleBrowserRuntime(runtimeRoot);

  const entry = join(runtimeRoot, "browser-runtime", "server.mjs");
  if (!existsSync(entry)) {
    console.warn(
      "browser: browser-runtime/server.mjs not found — skip auto-start (set AGENT_GUI_SKIP_BROWSER_RUNTIME=1 to silence)",
    );
    return null;
  }

  console.log(`browser: starting Node browser-runtime at ${base}`);
  const child = spawn(
    process.execPath,
    [entry, "--host", host, "--port", String(port)],
    {
      cwd: runtimeRoot,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
      env: {
        ...process.env,
        QUICKER_BROWSER_HOST: host,
        QUICKER_BROWSER_PORT: String(port),
        QUICKER_BROWSER_HEADLESS: process.env.QUICKER_BROWSER_HEADLESS ?? "1",
      },
    },
  );

  child.stdout?.on("data", (chunk) => {
    const line = chunk.toString().trimEnd();
    if (line) console.log(`[browser] ${line}`);
  });
  child.stderr?.on("data", (chunk) => {
    const line = chunk.toString().trimEnd();
    if (line) console.error(`[browser] ${line}`);
  });
  child.on("error", (err) => {
    console.error(`[browser] failed to start: ${err.message}`);
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && code !== null && signal !== "SIGTERM") {
      console.error(
        `browser runtime exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
      );
    }
  });

  if (!child.pid) {
    console.warn(
      "browser: could not spawn browser-runtime — run pnpm browser:install && pnpm browser:dev-server",
    );
    return null;
  }

  trackBrowserRuntimeChild(runtimeRoot, child, { port });

  try {
    await waitForBrowserRuntimeHealth(base);
    console.log(`browser: ready at ${base}/health`);
    return child;
  } catch (err) {
    console.warn(
      `browser: ${err instanceof Error ? err.message : String(err)} — browser tool may be unavailable`,
    );
    await stopOwnedBrowserChild(runtimeRoot, child);
    return null;
  }
}
