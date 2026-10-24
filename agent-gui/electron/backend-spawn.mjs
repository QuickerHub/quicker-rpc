import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { reserveSmokeUiPort, startSmokeRpcGuard, writeSmokeHandshake } from "./smoke-isolation.mjs";
import { AGENT_DATA_DIRECTORY_ENV } from "../lib/agent-data-profile.mjs";
import { resolveRuntimeEntry } from "./runtime-entry.mjs";

const UI_PORT_PREFERRED = 3000;
const QKRPC_PORT_DEFAULT = 9477;

/** @typedef {{ child: import('node:child_process').ChildProcess, port: number, smokeJobOwned?: boolean }} ManagedChild */

/** @type {{ qkrpc?: ManagedChild, node?: ManagedChild }} */
const children = {};
let smokeRpcGuard;
let backendShutdown;
let pendingStartup;
let startupOwner;
let closing = false;

export class BackendStartupCancelledError extends Error {
  constructor() {
    super("Desktop backend startup was cancelled by shutdown");
    this.name = "BackendStartupCancelledError";
  }
}

function sleep(ms, signal) {
  return delay(ms, undefined, { signal });
}

function isPortFree(host, port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePort(host, start, maxAttempts = 200, signal) {
  for (let port = start; port < start + maxAttempts; port++) {
    signal?.throwIfAborted();
    const free = await isPortFree(host, port);
    signal?.throwIfAborted();
    if (free) return port;
  }
  throw new Error(`no free port from ${start} on ${host}`);
}

async function httpProbe(host, port, path, mode, maxMs, signal) {
  const started = Date.now();
  const request =
    `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`;

  while (Date.now() - started < maxMs) {
    signal?.throwIfAborted();
    try {
      const text = await new Promise((resolve, reject) => {
        const socket = createConnection({ host, port }, () => {
          if (!signal?.aborted) socket.write(request);
        });
        let buf = "";
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener("abort", aborted);
          socket.setTimeout(0);
          socket.destroy();
          if (error) reject(error); else resolve(buf);
        };
        const aborted = () => finish(signal.reason);
        socket.on("data", (chunk) => {
          buf += chunk.toString("utf8");
        });
        socket.once("end", () => finish());
        socket.on("error", finish);
        socket.once("close", () => {
          finish(new Error("Probe connection closed before the response ended"));
          socket.removeListener("error", finish);
        });
        socket.setTimeout(800, () => finish(new Error("timeout")));
        signal?.addEventListener("abort", aborted, { once: true });
        if (signal?.aborted) aborted();
      });
      signal?.throwIfAborted();

      const ok200 = text.includes("HTTP/1.1 200") || text.includes("HTTP/1.0 200");
      if (mode === "status200" && ok200) return true;
      if (
        mode === "qkrpcHealth"
        && (text.includes('"ok":true') || text.includes('"ok":false'))
        && (ok200 || text.includes("HTTP/1.1 503"))
      ) {
        return true;
      }
    } catch {
      signal?.throwIfAborted();
      // retry
    }
    await sleep(Date.now() - started < 3000 ? 80 : 200, signal);
  }
  return false;
}

export async function killChildTree(child, { timeoutMs = 1000, abortSignal } = {}) {
  if (!child?.pid || child.exitCode != null || child.signalCode != null) return;
  abortSignal?.throwIfAborted();
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      let command;
      let timer;
      let finished = false;
      const finish = (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        abortSignal?.removeEventListener("abort", onAbort);
        if (error) {
          // Cancel only this helper. The backend handle stays registered until its actual exit.
          if (command?.pid && command.exitCode == null && command.signalCode == null) {
            try { command.kill(); } catch { /* The original stop failure remains authoritative. */ }
          }
          reject(error);
        } else resolve();
      };
      const onAbort = () => finish(abortSignal.reason ?? new Error("Backend stop was cancelled"));
      const onError = (error) => finish(new Error(`Failed to stop owned backend ${child.pid}: ${error.message}`));
      const onExit = (code) => {
        command.off("error", onError);
        finish(code === 0 || child.exitCode != null || child.signalCode != null
          ? undefined : new Error(`Failed to stop owned backend ${child.pid}`));
      };
      const onClose = () => {
        command.off("error", onError);
        command.off("exit", onExit);
      };
      try {
        command = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        // Keep the error listener through helper cancellation, which may itself emit an error.
        command.on("error", onError);
        command.once("exit", onExit);
        command.once("close", onClose);
        timer = setTimeout(() => finish(new Error(`Stopping owned backend ${child.pid} timed out`)), timeoutMs);
        abortSignal?.addEventListener("abort", onAbort, { once: true });
        if (abortSignal?.aborted) onAbort();
      } catch (error) { finish(error); }
    });
    return;
  }
  if (!child.kill("SIGTERM")) throw new Error(`Failed to stop owned backend ${child.pid}`);
}

export function shutdownBackends() {
  if (backendShutdown) return backendShutdown;
  let resolveShutdown, rejectShutdown;
  backendShutdown = new Promise((resolve, reject) => { resolveShutdown = resolve; rejectShutdown = reject; });
  closing = true;
  const startup = pendingStartup;
  const owner = startupOwner;
  startupOwner?.abort(new BackendStartupCancelledError());
  const stop = async () => {
    // Startup can still be registering resources after a port/listener await.
    await startup?.catch(() => {});
    const guard = smokeRpcGuard;
    smokeRpcGuard = undefined;
    const node = children.node;
    const qkrpc = children.qkrpc;
    await guard?.close();
    if (node) {
      // The smoke launcher owns the native Job handle, including startup failures.
      if (!node.smokeJobOwned) await stopAgentChild(node.child);
      if (children.node === node) children.node = undefined;
    }
    if (qkrpc) {
      await stopAgentChild(qkrpc.child, 0);
      if (children.qkrpc === qkrpc) children.qkrpc = undefined;
    }
  };
  void stop().then(() => {
    if (pendingStartup === startup) {
      pendingStartup = undefined;
      if (startupOwner === owner) startupOwner = undefined;
    }
    closing = false;
    resolveShutdown();
  }, (error) => {
    closing = false;
    backendShutdown = undefined; // Keep retained handles available for a retry.
    rejectShutdown(error);
  });
  return backendShutdown;
}

/** IPC drains turns and tools; fallback kill still waits for the retained handle's exit. */
export function stopAgentChild(child, graceMs = 2500, { forceTimeoutMs = 1000 } = {}) {
  if (!child?.pid || child.exitCode != null || child.signalCode != null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer;
    let settled = false;
    let forcing = false;
    const forceController = new AbortController();
    const complete = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", done);
      forceController.abort();
      if (error) reject(error); else resolve();
    };
    const done = () => complete();
    const force = () => {
      if (settled || forcing) return;
      if (child.exitCode != null || child.signalCode != null) { done(); return; }
      forcing = true;
      clearTimeout(timer);
      timer = setTimeout(() => complete(new Error(`Owned backend ${child.pid} did not exit`)), forceTimeoutMs);
      void killChildTree(child, { timeoutMs: forceTimeoutMs, abortSignal: forceController.signal }).catch((error) => {
        if (child.exitCode != null || child.signalCode != null) done();
        else complete(error);
      });
    };
    child.once("exit", done);
    if (child.connected) {
      timer = setTimeout(force, graceMs);
      try { child.send("shutdown", (error) => { if (error) force(); }); }
      catch { force(); }
    } else force();
  });
}

async function resolveQkrpcPort(host, signal) {
  const healthy = await httpProbe(host, QKRPC_PORT_DEFAULT, "/health", "qkrpcHealth", 350, signal);
  if (healthy) return { port: QKRPC_PORT_DEFAULT, shouldSpawn: false };
  const free = await isPortFree(host, QKRPC_PORT_DEFAULT);
  signal.throwIfAborted();
  if (free) {
    return { port: QKRPC_PORT_DEFAULT, shouldSpawn: true };
  }
  const port = await findFreePort(host, QKRPC_PORT_DEFAULT + 1, undefined, signal);
  return { port, shouldSpawn: true };
}

async function resolveUiPort(host, signal) {
  const free = await isPortFree(host, UI_PORT_PREFERRED);
  signal.throwIfAborted();
  if (free) {
    return UI_PORT_PREFERRED;
  }
  console.warn(
    `[startup] port ${UI_PORT_PREFERRED} busy; using next free port — chat auto-restore may differ`,
  );
  return findFreePort(host, UI_PORT_PREFERRED + 1, undefined, signal);
}

function waitForChildSpawn(child, label, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener("abort", aborted);
      child.off("spawn", spawned); child.off("error", failed); child.off("close", closed);
    };
    const spawned = () => { cleanup(); if (!settled) { settled = true; resolve(); } };
    const failed = (error) => { cleanup(); if (!settled) { settled = true; reject(new Error(`${label} spawn failed: ${error.message}`)); } };
    const closed = () => failed(new Error("child closed before spawn"));
    const aborted = () => {
      if (!settled) { settled = true; signal.removeEventListener("abort", aborted); reject(signal.reason); }
      // Keep child listeners until spawn/error/close so a late spawn failure is observed.
    };
    child.once("spawn", spawned); child.once("error", failed); child.once("close", closed);
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

function buildBundledChildEnv(host, port, extra = {}) {
  /** @type {Record<string, string | undefined>} */
  const env = {
    SystemRoot: process.env.SystemRoot,
    SystemDrive: process.env.SystemDrive,
    ComSpec: process.env.ComSpec,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    USERPROFILE: process.env.USERPROFILE,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    APPDATA: process.env.APPDATA,
    [AGENT_DATA_DIRECTORY_ENV]: process.env[AGENT_DATA_DIRECTORY_ENV],
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    HOSTNAME: host,
    PORT: String(port),
    AGENT_GUI_BUNDLED: "1",
    QUICKER_EMBEDDED_BROWSER_HOST:
      process.env.QUICKER_EMBEDDED_BROWSER_HOST
      ?? process.env.AGENT_GUI_EMBEDDED_BROWSER_HOST
      ?? host,
    QUICKER_EMBEDDED_BROWSER_PORT:
      process.env.QUICKER_EMBEDDED_BROWSER_PORT
      ?? process.env.AGENT_GUI_EMBEDDED_BROWSER_PORT,
    ...extra,
  };
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) delete env[key];
  }
  return env;
}

function spawnQkrpc(qkrpcDir, host, port) {
  const exe = join(qkrpcDir, process.platform === "win32" ? "qkrpc.exe" : "qkrpc");
  if (!existsSync(exe)) {
    throw new Error(`qkrpc.exe not found: ${exe}`);
  }
  const child = spawn(
    exe,
    ["serve", "--host", host, "--port", String(port), "--no-bootstrap"],
    {
      cwd: qkrpcDir,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  children.qkrpc = { child, port };
  return child;
}

function spawnNodeServer(appDir, nodeExe, host, port, envExtra = {}, smokeJobOwned = false, entry = resolveRuntimeEntry(appDir)) {
  const serverJs = entry.path;
  if (!existsSync(serverJs)) {
    throw new Error(`Agent runtime entry not found: ${serverJs}`);
  }
  const child = spawn(nodeExe, entry.kind === "static" ? [serverJs, "--host", host, "--port", String(port)] : [serverJs], {
    cwd: appDir,
    stdio: entry.kind === "static" ? ["ignore", "ignore", "pipe", "ipc"] : "ignore",
    windowsHide: true,
    env: buildBundledChildEnv(host, port, envExtra),
  });
  child.stderr?.on("data", (chunk) => console.error(`[agent service] ${chunk.toString().trimEnd()}`));
  children.node = { child, port, smokeJobOwned };
  return child;
}

/**
 * Start bundled Node UI + qkrpc for production Electron shell.
 * @param {{
 *   resourceRoot: string,
 *   appDir: string,
 *   nodeExe: string,
 *   qkrpcDir: string,
 * }} runtime
 * @returns {Promise<{ uiUrl: string, host: string, uiPort: number, qkrpcPort: number }>}
 */
export async function startProductionBackends(runtime) {
  if (pendingStartup || closing || children.node || children.qkrpc) throw new Error("Desktop backends already started or starting");
  const owner = new AbortController();
  startupOwner = owner;
  backendShutdown = undefined;
  // Publish ownership before resource allocation or reentrant shutdown can run.
  const pending = Promise.resolve().then(() => startOwnedBackends(runtime, owner.signal));
  pendingStartup = pending;
  try {
    return await pending;
  } catch (error) {
    const failure = owner.signal.aborted ? owner.signal.reason : error;
    await shutdownBackends();
    throw failure;
  } finally {
    if (pendingStartup === pending) {
      pendingStartup = undefined;
      startupOwner = undefined;
    }
  }
}

async function startOwnedBackends(runtime, signal) {
  signal.throwIfAborted();
  const entry = resolveRuntimeEntry(runtime.appDir, { mode: runtime.runtimeMode });
  const host = "127.0.0.1";
  if (runtime.smoke) {
    smokeRpcGuard = await startSmokeRpcGuard();
    signal.throwIfAborted();
    const uiPort = await reserveSmokeUiPort();
    signal.throwIfAborted();
    const child = spawnNodeServer(runtime.appDir, runtime.nodeExe, host, uiPort, {
      QKRPC_HTTP_URL: `http://${host}:${smokeRpcGuard.port}`, QKRPC_TRANSPORT: "http",
      HOME: process.env.HOME, AGENT_GUI_ROOT: process.env.AGENT_GUI_ROOT,
      AGENT_GUI_DEFAULT_CWD: process.env.AGENT_GUI_DEFAULT_CWD,
    }, true, entry);
    await waitForChildSpawn(child, "isolated smoke node", signal);
    signal.throwIfAborted();
    writeSmokeHandshake(runtime.smoke, { uiPort, uiPid: child.pid, rpcPort: smokeRpcGuard.port, rpcPid: process.pid });
    return { uiUrl: `http://${host}:${uiPort}`, host, uiPort, qkrpcPort: smokeRpcGuard.port };
  }
  const { port: qkrpcPort, shouldSpawn } = await resolveQkrpcPort(host, signal);
  const uiPort = await resolveUiPort(host, signal);
  signal.throwIfAborted();
  const qkrpcUrl = `http://${host}:${qkrpcPort}`;
  const qkrpcExe = join(runtime.qkrpcDir, process.platform === "win32" ? "qkrpc.exe" : "qkrpc");
  const nodeEnv = { QKRPC_HTTP_URL: qkrpcUrl, QKRPC_TRANSPORT: "http", QKRPC_BIN: qkrpcExe };

  if (shouldSpawn) {
    const qkrpcChild = spawnQkrpc(runtime.qkrpcDir, host, qkrpcPort);
    await waitForChildSpawn(qkrpcChild, "qkrpc", signal);
    const ok = await httpProbe(host, qkrpcPort, "/health", "qkrpcHealth", 45_000, signal);
    if (!ok) throw new Error(`timeout waiting for qkrpc serve on ${qkrpcUrl}`);
  }

  signal.throwIfAborted();
  const nodeChild = spawnNodeServer(runtime.appDir, runtime.nodeExe, host, uiPort, nodeEnv, false, entry);
  await waitForChildSpawn(nodeChild, "node", signal);
  const uiOk = await httpProbe(host, uiPort, "/", "status200", 60_000, signal);
  if (!uiOk) throw new Error(`timeout waiting for UI http://${host}:${uiPort}/`);
  signal.throwIfAborted();
  return { uiUrl: `http://${host}:${uiPort}`, host, uiPort, qkrpcPort };
}
