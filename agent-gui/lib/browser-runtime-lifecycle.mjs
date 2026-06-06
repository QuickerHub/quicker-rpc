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

const STATE_FILE = "browser-runtime.json";
const DEFAULT_BROWSER_PORT = 6017;

/** @typedef {{ pid: number; port?: number; ownerPid: number; startedAt: number }} BrowserRuntimeState */

export function browserRuntimeStatePath(agentGuiRoot) {
  return join(agentGuiRoot, ".runtime", STATE_FILE);
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

/** @param {string} base e.g. http://127.0.0.1:6017 */
export async function checkBrowserRuntimeHealth(base, timeoutMs = 3000) {
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
    return body?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForBrowserRuntimeHealth(base, maxMs = 45_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await checkBrowserRuntimeHealth(base, 2500)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`browser runtime did not become ready at ${base}/health`);
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
 * Stop orphaned browser runtime from a prior agent-gui session.
 * @param {string} agentGuiRoot
 */
export function reconcileStaleBrowserRuntime(agentGuiRoot) {
  const state = readBrowserRuntimeState(agentGuiRoot);
  if (!state) return false;

  const serveAlive = isProcessAlive(state.pid);
  const ownerAlive = isProcessAlive(state.ownerPid);

  if (serveAlive && !ownerAlive) {
    killProcessTree(state.pid);
    clearBrowserRuntimeState(agentGuiRoot);
    return true;
  }

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
  if (!pid) return;

  writeBrowserRuntimeState(agentGuiRoot, {
    pid,
    ownerPid: process.pid,
    startedAt: Date.now(),
    port: meta.port,
  });

  child.on("exit", () => {
    const current = readBrowserRuntimeState(agentGuiRoot);
    if (current?.pid === pid) {
      clearBrowserRuntimeState(agentGuiRoot);
    }
  });
}

/**
 * @param {string} agentGuiRoot
 * @param {import('node:child_process').ChildProcess | null | undefined} child
 */
export function stopTrackedBrowserRuntime(agentGuiRoot, child) {
  if (child?.pid && !child.killed) {
    killProcessTree(child.pid);
  }
  clearBrowserRuntimeState(agentGuiRoot);
}

/**
 * Dev-only: ensure quicker-browser-runtime is listening (reuse or spawn via uv).
 * @param {string} agentGuiRoot
 * @param {string} host
 * @returns {Promise<import('node:child_process').ChildProcess | null>}
 */
export async function ensureBrowserRuntime(agentGuiRoot, host) {
  if (process.env.AGENT_GUI_SKIP_BROWSER_RUNTIME === "1") {
    return null;
  }

  const port = resolveBrowserPort();
  const base = `http://${host}:${port}`;

  if (await checkBrowserRuntimeHealth(base)) {
    console.log(`browser: reusing runtime at ${base}/health`);
    return null;
  }

  reconcileStaleBrowserRuntime(agentGuiRoot);

  const runtimeDir = join(agentGuiRoot, "..", "browser-runtime");
  if (!existsSync(join(runtimeDir, "pyproject.toml"))) {
    console.warn(
      "browser: browser-runtime not found — skip auto-start (set AGENT_GUI_SKIP_BROWSER_RUNTIME=1 to silence)",
    );
    return null;
  }

  console.log(`browser: starting quicker-browser-runtime at ${base} (uv run)`);
  const child = spawn(
    "uv",
    ["run", "quicker-browser-runtime", "--host", host, "--port", String(port)],
    {
      cwd: runtimeDir,
      stdio: ["ignore", "pipe", "pipe"],
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
      "browser: could not spawn uv — install uv and browser-runtime deps, or run pnpm browser:dev-server manually",
    );
    return null;
  }

  trackBrowserRuntimeChild(agentGuiRoot, child, { port });

  try {
    await waitForBrowserRuntimeHealth(base);
    console.log(`browser: ready at ${base}/health`);
    return child;
  } catch (err) {
    console.warn(
      `browser: ${err instanceof Error ? err.message : String(err)} — browser tool may be unavailable`,
    );
    stopTrackedBrowserRuntime(agentGuiRoot, child);
    return null;
  }
}
