import { spawn } from "node:child_process";
import { join } from "node:path";
import { reconcileStaleQkrpcServe, stopTrackedQkrpcServe, trackQkrpcServeChild } from "../../agent-gui/lib/qkrpc-serve-lifecycle.mjs";
import { ensureStagedQkrpcRuntime, resolveServeQkrpcRuntime } from "../../agent-gui/lib/qkrpc-bin.mjs";
import { discoverHealthyQkrpcServe } from "../../agent-gui/lib/qkrpc-serve-discover.mjs";
import { attachTaggedLogs } from "./log-multiplexer.mjs";

/** @param {string} host @param {number} preferred */
async function findAvailablePort(host, preferred) {
  const net = await import("node:net");
  const tryListen = (port) =>
    new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once("error", reject);
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port, host);
    });

  for (let port = preferred; port < preferred + 32; port++) {
    try {
      return await tryListen(port);
    } catch {
      // try next
    }
  }
  throw new Error(`No free port near ${preferred} on ${host}`);
}

function normalizeBase(url) {
  return url.replace(/\/$/, "");
}

/** @param {string} base @param {number} timeoutMs */
async function waitForHealth(base, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkHealth(base)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`qkrpc serve did not become ready at ${base}`);
}

/** @param {string} base @param {number} [timeoutMs] */
export async function checkHealth(base, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${normalizeBase(base)}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status !== 200 && res.status !== 503) return false;
    const body = await res.json();
    return typeof body?.ok === "boolean";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @typedef {{
 *   repoRoot: string;
 *   agentGuiRoot: string;
 *   host?: string;
 * }} QkrpcServiceOptions
 */

export function createQkrpcService(options) {
  const repoRoot = options.repoRoot;
  const agentGuiRoot = options.agentGuiRoot;
  const host = options.host ?? "127.0.0.1";

  /** @type {import('node:child_process').ChildProcess | null} */
  let child = null;
  let port = Number(process.env.QKRPC_PORT?.trim() || process.env.AGENT_GUI_QKRPC_PORT?.trim() || "9477");
  let baseUrl = `http://${host}:${port}`;

  async function resolveRuntime() {
    reconcileStaleQkrpcServe(agentGuiRoot);
    ensureStagedQkrpcRuntime(agentGuiRoot);
    const runtime = resolveServeQkrpcRuntime(agentGuiRoot);
    if (!runtime) {
      return null;
    }
    return runtime;
  }

  async function stop() {
    stopTrackedQkrpcServe(agentGuiRoot, child);
    child = null;
  }

  async function start() {
    await stop();
    const runtime = await resolveRuntime();
    if (!runtime) {
      throw new Error(
        "qkrpc runtime missing (run dev hot-update first, or manually run build.ps1 -t)",
      );
    }

    const discovered = await discoverHealthyQkrpcServe(host, port);
    if (discovered) {
      port = discovered.port;
      baseUrl = discovered.baseUrl;
      process.env.QKRPC_HTTP_URL = baseUrl;
      process.env.QKRPC_TRANSPORT = "http";
      process.env.QKRPC_BIN = runtime.exe;
      console.log(`[qkrpc] reusing serve at ${baseUrl}`);
      return { port, baseUrl, pid: null };
    }

    port = await findAvailablePort(host, port);
    baseUrl = `http://${host}:${port}`;
    process.env.QKRPC_HTTP_URL = baseUrl;
    process.env.QKRPC_TRANSPORT = "http";
    process.env.QKRPC_BIN = runtime.exe;

    const { exe, dir: cwd, source } = runtime;
    child = spawn(
      exe,
      ["serve", "--host", host, "--port", String(port), "--no-bootstrap"],
      {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: process.env,
      },
    );
    trackQkrpcServeChild(agentGuiRoot, child, { runtimeDir: cwd, port });
    attachTaggedLogs(child, "qkrpc");

    child.on("exit", (code, signal) => {
      if (code !== 0 && code !== null && signal !== "SIGTERM") {
        console.error(
          `[qkrpc] serve exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
        );
      }
      child = null;
    });

    await waitForHealth(baseUrl);
    console.log(
      `[qkrpc] ready at ${baseUrl} (${exe}, source=${source})`,
    );
    return { port, baseUrl, pid: child.pid };
  }

  async function restart() {
    ensureStagedQkrpcRuntime(agentGuiRoot);
    return start();
  }

  return {
    start,
    stop,
    restart,
    checkHealth: () => checkHealth(baseUrl),
    getBaseUrl: () => baseUrl,
    getPort: () => port,
    isRunning: () => child != null && child.exitCode == null,
    hasRuntime: () => resolveServeQkrpcRuntime(agentGuiRoot) != null,
  };
}
