import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveServeQkrpcRuntime } from "./qkrpc-bin.mjs";
import {
  isProcessAlive,
  readQkrpcServeState,
  trackQkrpcServeChild,
} from "./qkrpc-serve-lifecycle.mjs";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {Promise<boolean> | null} */
let ensureInFlight = null;

/** @type {import('node:child_process').ChildProcess | null} */
let managedChild = null;

function normalizeBase(url) {
  return url.replace(/\/$/, "");
}

/** Serve process is up when /health returns JSON with boolean ok (Quicker may be offline). */
async function isServeListening(base, timeoutMs = 1_500) {
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

async function waitForServeListening(base, maxMs = 20_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await isServeListening(base, 2_000)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function resolveServeRuntime() {
  const runtime = resolveServeQkrpcRuntime(agentGuiRoot);
  if (!runtime) return null;
  return { exe: runtime.exe, dir: runtime.dir, source: runtime.source };
}

/**
 * Start bundled qkrpc serve when /health is unreachable (e.g. after build.ps1 -t killed it).
 * Safe to call from /api/ping — no-op when serve is already listening.
 * @returns {Promise<boolean>} true when serve responds on /health
 */
export async function ensureQkrpcServeIfDown() {
  if (process.env.AGENT_GUI_SKIP_QKRPC === "1") {
    return false;
  }

  const host = "127.0.0.1";
  const base =
    process.env.QKRPC_HTTP_URL?.trim()
    ?? process.env.QKRPC_HTTP?.trim()
    ?? `http://${host}:9477`;

  if (await isServeListening(base)) {
    return true;
  }

  if (ensureInFlight) {
    return ensureInFlight;
  }

  ensureInFlight = (async () => {
    const state = readQkrpcServeState(agentGuiRoot);
    if (state && isProcessAlive(state.pid)) {
      return waitForServeListening(base);
    }
    if (managedChild?.pid && isProcessAlive(managedChild.pid)) {
      return waitForServeListening(base);
    }

    const runtime = resolveServeRuntime();
    if (!runtime) {
      return false;
    }

    const portMatch = base.match(/:(\d+)(?:\/|$)/);
    const port = portMatch ? Number(portMatch[1]) : 9477;

    if (!process.env.QKRPC_HTTP_URL?.trim() && !process.env.QKRPC_HTTP?.trim()) {
      process.env.QKRPC_HTTP_URL = base;
      process.env.QKRPC_TRANSPORT = "http";
    }
    if (!process.env.QKRPC_BIN?.trim()) {
      process.env.QKRPC_BIN = runtime.exe;
    }

    managedChild = spawn(
      runtime.exe,
      ["serve", "--host", host, "--port", String(port), "--no-bootstrap"],
      {
        cwd: runtime.dir,
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
        detached: false,
        env: process.env,
      },
    );
    trackQkrpcServeChild(agentGuiRoot, managedChild, {
      runtimeDir: runtime.dir,
      port,
    });
    managedChild.on("exit", () => {
      managedChild = null;
    });

    return waitForServeListening(base);
  })();

  try {
    return await ensureInFlight;
  } finally {
    ensureInFlight = null;
  }
}
