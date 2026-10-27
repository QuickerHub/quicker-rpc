import { runtimeHttpOrigin } from "./runtime-http-origin.mjs";
import { requestOwnedChildTreeStop } from "./owned-child-stop.mjs";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { RUNTIME_VERSION } from "../terminal-runtime/config.mjs";
import { isProcessAlive } from "./qkrpc-serve-lifecycle.mjs";

const STATE_FILE = "terminal-runtime.json";
const DEFAULT_TERMINAL_PORT = 6022;
/** @type {Map<import('node:child_process').ChildProcess, { root: string; statePath: string; base?: string; pid: number; ownerPid: number; onExit: () => void; stopping?: Promise<void> }>} */
const ownedTerminalChildren = new Map();
/** @type {Map<string, { scope: string; controller: AbortController; promise: Promise<import('node:child_process').ChildProcess | null> }>} */
const terminalRuntimeStarts = new Map();
/** @type {Promise<void> | undefined} */
let terminalRuntimeStop;

/** @typedef {{ pid: number; port?: number; ownerPid: number; startedAt: number }} TerminalRuntimeState */

export function terminalRuntimeStatePath(agentGuiRoot) {
  return join(process.env.AGENT_GUI_RUNTIME_STATE_DIR?.trim() || join(agentGuiRoot, ".runtime"), STATE_FILE);
}

/** @returns {TerminalRuntimeState | null} */
export function readTerminalRuntimeState(agentGuiRoot) {
  return readTerminalRuntimeStateAtPath(terminalRuntimeStatePath(agentGuiRoot));
}

function readTerminalRuntimeStateAtPath(path) {
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
  writeTerminalRuntimeStateAtPath(terminalRuntimeStatePath(agentGuiRoot), state);
}

function writeTerminalRuntimeStateAtPath(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state)}\n`, "utf8");
}

export function clearTerminalRuntimeState(agentGuiRoot) {
  clearTerminalRuntimeStateAtPath(terminalRuntimeStatePath(agentGuiRoot));
}

function clearTerminalRuntimeStateAtPath(path) {
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

/** @typedef {{ ok: boolean; runtimeOwner?: string; runtimeVersion?: string; protocolVersion?: string }} TerminalRuntimeHealth */

/** @param {string} base */
export async function fetchTerminalRuntimeHealth(base, timeoutMs = 3000, abortSignal) {
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
    if (!res.ok) {
      await res.body?.cancel();
      abortSignal?.throwIfAborted();
      return { ok: false };
    }
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

/** @param {string} base */
export async function checkTerminalRuntimeHealth(base, timeoutMs = 3000, abortSignal) {
  const health = await fetchTerminalRuntimeHealth(base, timeoutMs, abortSignal);
  return health.ok === true && (!process.env.QUICKER_AGENT_RUNTIME_OWNER || health.runtimeOwner === process.env.QUICKER_AGENT_RUNTIME_OWNER);
}

/** @param {TerminalRuntimeHealth} health */
export function isTerminalRuntimeVersionCurrent(health) {
  return isTerminalRuntimeCurrentForOwner(health, process.env.QUICKER_AGENT_RUNTIME_OWNER);
}

function isTerminalRuntimeCurrentForOwner(health, owner) {
  return health.ok === true && health.runtimeVersion === RUNTIME_VERSION
    && (!owner || health.runtimeOwner === owner);
}

async function waitForTerminalRuntimeHealth(base, maxMs = 30_000, abortSignal, owner) {
  const deadline = Date.now() + maxMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    abortSignal?.throwIfAborted();
    const health = await fetchTerminalRuntimeHealth(base, 1200, abortSignal);
    abortSignal?.throwIfAborted();
    if (isTerminalRuntimeCurrentForOwner(health, owner)) return;
    attempt += 1;
    const delayMs = attempt <= 8 ? 60 : attempt <= 20 ? 120 : 250;
    await delay(delayMs, undefined, { signal: abortSignal });
  }
  throw new Error(`terminal runtime did not become ready at ${base}/health`);
}

/**
 * Stop orphaned terminal runtime from a prior agent-gui session.
 * @param {string} agentGuiRoot
 */
export function reconcileStaleTerminalRuntime(agentGuiRoot) {
  return reconcileTerminalRuntimeState(terminalRuntimeStatePath(agentGuiRoot));
}

function reconcileTerminalRuntimeState(statePath) {
  const state = readTerminalRuntimeStateAtPath(statePath);
  if (!state) return false;

  const serveAlive = isProcessAlive(state.pid);
  const ownerAlive = isProcessAlive(state.ownerPid);

  // A prior owner's PID may have been recycled. Only retained child handles may stop it.
  if (serveAlive && !ownerAlive) return false;

  if (!serveAlive) {
    clearTerminalRuntimeStateAtPath(statePath);
  }

  return false;
}

/**
 * @param {string} agentGuiRoot
 * @param {import('node:child_process').ChildProcess} child
 * @param {{ port?: number; base?: string; statePath?: string }} meta
 */
export function trackTerminalRuntimeChild(agentGuiRoot, child, meta = {}) {
  const pid = child.pid;
  if (!pid || child.exitCode != null || child.signalCode != null || ownedTerminalChildren.has(child)) return;
  const root = resolve(agentGuiRoot);
  const ownerPid = process.pid;
  const owned = { root, statePath: meta.statePath ?? terminalRuntimeStatePath(root), base: meta.base, pid, ownerPid, onExit: () => {
    finishOwnedTerminalChild(child, owned);
  } };
  ownedTerminalChildren.set(child, owned);
  child.once("exit", owned.onExit);

  writeTerminalRuntimeStateAtPath(owned.statePath, {
    pid,
    ownerPid,
    startedAt: Date.now(),
    port: meta.port,
  });

}

function clearOwnedTerminalState(owned) {
  const current = readTerminalRuntimeStateAtPath(owned.statePath);
  if (current?.pid === owned.pid && current.ownerPid === owned.ownerPid) {
    clearTerminalRuntimeStateAtPath(owned.statePath);
  }
}

function finishOwnedTerminalChild(child, owned) {
  if (ownedTerminalChildren.get(child) !== owned) return;
  ownedTerminalChildren.delete(child);
  child.removeListener("exit", owned.onExit);
  clearOwnedTerminalState(owned);
}

function stopOwnedTerminalChild(agentGuiRoot, child) {
  const owned = child && ownedTerminalChildren.get(child);
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
    finishOwnedTerminalChild(child, owned);
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
  else if (child.pid !== owned.pid) failed(new Error("Owned terminal runtime child identity changed"));
  else {
    timer = setTimeout(() => failed(new Error(`Owned terminal runtime ${owned.pid} did not exit within 2000ms`)), 2000);
    void requestOwnedChildTreeStop(child).then((accepted) => {
      if (!accepted) failed(new Error(`Failed to stop owned terminal runtime ${owned.pid}`));
    }, failed);
  }
  return pending;
}

/**
 * @param {string} agentGuiRoot
 * @param {import('node:child_process').ChildProcess | null | undefined} child
 */
export function stopTrackedTerminalRuntime(agentGuiRoot, child) {
  void stopOwnedTerminalChild(agentGuiRoot, child).catch((error) => console.error("[terminal runtime stop]", error));
}

/** Stop only children spawned and retained by this process; reused runtimes are not owned. */
export async function stopOwnedTerminalRuntimes() {
  if (terminalRuntimeStop) return terminalRuntimeStop;
  let resolveStop, rejectStop;
  const pending = new Promise((done, fail) => { resolveStop = done; rejectStop = fail; });
  terminalRuntimeStop = pending;
  const reset = () => { if (terminalRuntimeStop === pending) terminalRuntimeStop = undefined; };
  void pending.then(reset, reset);
  const starts = [...terminalRuntimeStarts.values()];
  for (const start of starts) start.controller.abort(new Error("Terminal runtime service is stopping"));
  void (async () => {
    await Promise.allSettled(starts.map((start) => start.promise));
    const results = await Promise.allSettled([...ownedTerminalChildren].map(([child, owned]) => stopOwnedTerminalChild(owned.root, child)));
    const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, "Owned terminal runtime shutdown failed");
  })().then(resolveStop, rejectStop);
  return pending;
}

/** A request owns its wait, while the service retains the shared startup. */
function observeTerminalStartup(pending, signal) {
  signal?.throwIfAborted();
  if (!signal) return pending;
  return new Promise((done, fail) => {
    const cleanup = () => signal.removeEventListener("abort", aborted);
    const aborted = () => { cleanup(); fail(signal.reason); };
    signal.addEventListener("abort", aborted, { once: true });
    void pending.then((value) => {
      cleanup();
      if (signal.aborted) fail(signal.reason); else done(value);
    }, (error) => { cleanup(); fail(signal.aborted ? signal.reason : error); });
  });
}

/**
 * Ensure Node terminal-runtime is listening (reuse or spawn).
 * @param {string} [agentGuiRoot]
 * @param {string} host
 */
export async function ensureTerminalRuntime(agentGuiRoot, host, abortSignal) {
  abortSignal?.throwIfAborted();
  if (process.env.AGENT_GUI_SKIP_TERMINAL_RUNTIME === "1") {
    return null;
  }
  if (terminalRuntimeStop) throw new Error("Terminal runtime service is stopping");

  const runtimeRoot = resolve(resolveTerminalRuntimeRoot(agentGuiRoot ?? process.cwd()));
  const port = resolveTerminalPort();
  const base = runtimeHttpOrigin(host, port);
  const owner = process.env.QUICKER_AGENT_RUNTIME_OWNER;
  const statePath = resolve(terminalRuntimeStatePath(runtimeRoot));
  const scope = JSON.stringify([runtimeRoot, owner ?? "", statePath]);
  let start = terminalRuntimeStarts.get(base);
  if (start && start.scope !== scope) throw new Error("Terminal runtime startup belongs to another owner or runtime root");
  if (!start) {
    const controller = new AbortController();
    start = { scope, controller, promise: Promise.resolve().then(() => startTerminalRuntime(runtimeRoot, host, port, base, owner, statePath, controller.signal)) };
    terminalRuntimeStarts.set(base, start);
    const retained = start;
    const release = () => { if (terminalRuntimeStarts.get(base) === retained) terminalRuntimeStarts.delete(base); };
    void start.promise.then(release, release);
  }
  return observeTerminalStartup(start.promise, abortSignal);
}

async function startTerminalRuntime(runtimeRoot, host, port, base, owner, statePath, abortSignal) {
  abortSignal.throwIfAborted();
  const health = await fetchTerminalRuntimeHealth(base, undefined, abortSignal);
  abortSignal.throwIfAborted();
  if (isTerminalRuntimeCurrentForOwner(health, owner)) {
    console.log(`terminal: reusing runtime ${health.runtimeVersion} at ${base}/health`);
    return null;
  }

  if (health.ok) {
    throw new Error("terminal runtime port is owned by another service or an incompatible runtime");
  }

  // Failed cleanup retains ownership; an alive child must not be replaced.
  if ([...ownedTerminalChildren].some(([child, owned]) => owned.base === base && child.exitCode == null && child.signalCode == null)) return null;
  reconcileTerminalRuntimeState(statePath);

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
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      windowsHide: true,
      env: {
        ...process.env,
        QUICKER_TERMINAL_HOST: host,
        QUICKER_TERMINAL_PORT: String(port),
        QUICKER_AGENT_RUNTIME_OWNER: owner,
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

  const childStopped = new AbortController();
  const exited = () => childStopped.abort(new Error("Terminal runtime exited before becoming ready"));
  const failed = (error) => childStopped.abort(error);
  child.once("exit", exited);
  child.once("error", failed);
  try {
    trackTerminalRuntimeChild(runtimeRoot, child, { port, base, statePath });
    abortSignal.throwIfAborted();
    if (child.exitCode != null || child.signalCode != null) exited();
    await waitForTerminalRuntimeHealth(base, undefined, AbortSignal.any([abortSignal, childStopped.signal]), owner);
    abortSignal.throwIfAborted();
    childStopped.signal.throwIfAborted();
    if (child.exitCode != null || child.signalCode != null) throw new Error("Terminal runtime exited before readiness was published");
    console.log(`terminal: ready at ${base}/health`);
    return child;
  } catch (err) {
    // Only service shutdown cancels shared startup; its owner drains the child.
    abortSignal?.throwIfAborted();
    console.warn(
      `terminal: ${err instanceof Error ? err.message : String(err)} — embedded terminal may be unavailable`,
    );
    await stopOwnedTerminalChild(runtimeRoot, child);
    return null;
  } finally {
    child.removeListener("exit", exited);
    child.removeListener("error", failed);
  }
}
