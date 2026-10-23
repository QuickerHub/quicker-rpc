import { spawn, spawnSync } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function findFreePort(host, start, maxAttempts = 200) {
  for (let port = start; port < start + maxAttempts; port++) {
    if (await isPortFree(host, port)) return port;
  }
  throw new Error(`no free port from ${start} on ${host}`);
}

async function httpProbe(host, port, path, mode, maxMs) {
  const started = Date.now();
  const request =
    `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`;

  while (Date.now() - started < maxMs) {
    try {
      const text = await new Promise((resolve, reject) => {
        const socket = createConnection({ host, port }, () => {
          socket.write(request);
        });
        let buf = "";
        socket.on("data", (chunk) => {
          buf += chunk.toString("utf8");
        });
        socket.on("end", () => resolve(buf));
        socket.on("error", reject);
        socket.setTimeout(800, () => {
          socket.destroy();
          reject(new Error("timeout"));
        });
      });

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
      // retry
    }
    await sleep(Date.now() - started < 3000 ? 80 : 200);
  }
  return false;
}

export function killChildTree(child) {
  if (!child?.pid || child.exitCode != null || child.signalCode != null) return;
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    if (result.error || result.status !== 0) throw new Error(`Failed to stop owned backend ${child.pid}`);
    return;
  }
  if (!child.kill("SIGTERM")) throw new Error(`Failed to stop owned backend ${child.pid}`);
}

export function shutdownBackends() {
  if (backendShutdown) return backendShutdown;
  let resolveShutdown, rejectShutdown;
  backendShutdown = new Promise((resolve, reject) => { resolveShutdown = resolve; rejectShutdown = reject; });
  const guard = smokeRpcGuard;
  smokeRpcGuard = undefined;
  const guardStopped = guard?.close();
  const node = children.node;
  const qkrpc = children.qkrpc;
  const stop = async () => {
    await guardStopped;
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
  void stop().then(resolveShutdown, (error) => {
    backendShutdown = undefined; // Keep retained handles available for a retry.
    rejectShutdown(error);
  });
  return backendShutdown;
}

/** IPC drains turns and tools; fallback kill still waits for the retained handle's exit. */
export function stopAgentChild(child, graceMs = 2500) {
  if (!child?.pid || child.exitCode != null || child.signalCode != null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer;
    const clean = () => { clearTimeout(timer); child.off("exit", done); };
    const done = () => { clean(); resolve(); };
    const force = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { clean(); reject(new Error(`Owned backend ${child.pid} did not exit`)); }, 1000);
      try { killChildTree(child); }
      catch (error) { clean(); reject(error); }
    };
    child.once("exit", done);
    if (child.connected) {
      timer = setTimeout(force, graceMs);
      child.send("shutdown", (error) => { if (error) force(); });
    } else force();
  });
}

async function resolveQkrpcPort(host) {
  const healthy = await httpProbe(host, QKRPC_PORT_DEFAULT, "/health", "qkrpcHealth", 350);
  if (healthy) return { port: QKRPC_PORT_DEFAULT, shouldSpawn: false };
  if (await isPortFree(host, QKRPC_PORT_DEFAULT)) {
    return { port: QKRPC_PORT_DEFAULT, shouldSpawn: true };
  }
  const port = await findFreePort(host, QKRPC_PORT_DEFAULT + 1);
  return { port, shouldSpawn: true };
}

async function resolveUiPort(host) {
  if (await isPortFree(host, UI_PORT_PREFERRED)) {
    return UI_PORT_PREFERRED;
  }
  console.warn(
    `[startup] port ${UI_PORT_PREFERRED} busy; using next free port — chat auto-restore may differ`,
  );
  return findFreePort(host, UI_PORT_PREFERRED + 1);
}

function waitForChildSpawn(child, label) {
  return new Promise((resolve, reject) => {
    child.once("spawn", () => resolve());
    child.once("error", (err) => {
      reject(new Error(`${label} spawn failed: ${err.message}`));
    });
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

function spawnNodeServer(appDir, nodeExe, host, port, envExtra = {}, smokeJobOwned = false) {
  const entry = resolveRuntimeEntry(appDir);
  const serverJs = entry.path;
  if (!existsSync(serverJs)) {
    throw new Error(`server.js not found: ${serverJs}`);
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
  const host = "127.0.0.1";
  if (children.node || children.qkrpc) throw new Error("Desktop backends already started");
  backendShutdown = undefined;
  if (runtime.smoke) {
    try {
      smokeRpcGuard = await startSmokeRpcGuard();
      const uiPort = await reserveSmokeUiPort();
      const child = spawnNodeServer(runtime.appDir, runtime.nodeExe, host, uiPort, {
        QKRPC_HTTP_URL: `http://${host}:${smokeRpcGuard.port}`, QKRPC_TRANSPORT: "http",
        HOME: process.env.HOME, AGENT_GUI_ROOT: process.env.AGENT_GUI_ROOT,
        AGENT_GUI_DEFAULT_CWD: process.env.AGENT_GUI_DEFAULT_CWD,
      }, true);
      await waitForChildSpawn(child, "isolated smoke node");
      writeSmokeHandshake(runtime.smoke, { uiPort, uiPid: child.pid, rpcPort: smokeRpcGuard.port, rpcPid: process.pid });
      return { uiUrl: `http://${host}:${uiPort}`, host, uiPort, qkrpcPort: smokeRpcGuard.port };
    } catch (error) {
      shutdownBackends();
      throw error;
    }
  }
  try {
  const { port: qkrpcPort, shouldSpawn } = await resolveQkrpcPort(host);
  const uiPort = await resolveUiPort(host);
  const qkrpcUrl = `http://${host}:${qkrpcPort}`;
  const qkrpcExe = join(
    runtime.qkrpcDir,
    process.platform === "win32" ? "qkrpc.exe" : "qkrpc",
  );

  const nodeEnv = {
    QKRPC_HTTP_URL: qkrpcUrl,
    QKRPC_TRANSPORT: "http",
    QKRPC_BIN: qkrpcExe,
  };

  if (shouldSpawn) {
    const qkrpcChild = spawnQkrpc(runtime.qkrpcDir, host, qkrpcPort);
    await waitForChildSpawn(qkrpcChild, "qkrpc");
    const ok = await httpProbe(host, qkrpcPort, "/health", "qkrpcHealth", 45_000);
    if (!ok) {
      throw new Error(`timeout waiting for qkrpc serve on ${qkrpcUrl}`);
    }
  }

  const nodeChild = spawnNodeServer(runtime.appDir, runtime.nodeExe, host, uiPort, nodeEnv);
  await waitForChildSpawn(nodeChild, "node");
  const uiOk = await httpProbe(host, uiPort, "/", "status200", 60_000);
  if (!uiOk) {
    throw new Error(`timeout waiting for UI http://${host}:${uiPort}/`);
  }

  return {
    uiUrl: `http://${host}:${uiPort}`,
    host,
    uiPort,
    qkrpcPort,
  };
  } catch (error) {
    await shutdownBackends();
    throw error;
  }
}
