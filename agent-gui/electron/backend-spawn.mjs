import { spawn, spawnSync } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { existsSync } from "node:fs";
import { join } from "node:path";

const UI_PORT_PREFERRED = 3000;
const QKRPC_PORT_DEFAULT = 9477;

/** @typedef {{ child: import('node:child_process').ChildProcess, port: number }} ManagedChild */

/** @type {{ qkrpc?: ManagedChild, node?: ManagedChild }} */
const children = {};

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
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
}

export function shutdownBackends() {
  if (children.qkrpc) {
    killChildTree(children.qkrpc.child);
    children.qkrpc = undefined;
  }
  if (children.node) {
    killChildTree(children.node.child);
    children.node = undefined;
  }
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
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    HOSTNAME: host,
    PORT: String(port),
    AGENT_GUI_BUNDLED: "1",
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

function spawnNodeServer(appDir, nodeExe, host, port, envExtra = {}) {
  const serverJs = join(appDir, "server.js");
  if (!existsSync(serverJs)) {
    throw new Error(`server.js not found: ${serverJs}`);
  }
  const child = spawn(nodeExe, [serverJs], {
    cwd: appDir,
    stdio: "ignore",
    windowsHide: true,
    env: buildBundledChildEnv(host, port, envExtra),
  });
  children.node = { child, port };
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
}
