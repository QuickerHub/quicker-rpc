/**
 * Start bundled qkrpc serve (if present) + agent-gui on available ports.
 * Usage: node start.mjs [--dev] [--open-browser]
 */
import { exec, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ensureStagedQkrpcRuntime,
  isUserInstalledQkrpcPath,
  resolveQkrpcBin,
} from "./lib/qkrpc-bin.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const isDev = process.argv.includes("--dev");
const openBrowserCli = process.argv.includes("--open-browser");

/** Prefer portable Node shipped in publish package. */
function resolveNodeExe() {
  const bundled = join(root, "node", "node.exe");
  if (existsSync(bundled)) return bundled;
  return process.execPath;
}

/** @type {import('node:child_process').ChildProcess | null} */
let qkrpcChild = null;

function listenProbe(port, host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.once("listening", () => {
      server.close(() => resolve(port));
    });
    server.listen(port, host);
  });
}

async function findAvailablePort(host, preferred) {
  const base = Number.isFinite(preferred) && preferred > 0 ? preferred : 3000;
  const maxAttempts = 200;
  for (let offset = 0; offset < maxAttempts; offset++) {
    const port = base + offset;
    try {
      await listenProbe(port, host);
      return port;
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== "EADDRINUSE") {
        throw err;
      }
    }
  }
  throw new Error(`No available port in range ${base}–${base + maxAttempts - 1} on ${host}`);
}

async function resolveUiPort(host) {
  const strictPort =
    process.env.AGENT_GUI_STRICT_PORT === "1"
    || process.env.TAURI_ENV_DEBUG === "true";

  const raw = process.env.PORT?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      if (strictPort) {
        await listenProbe(parsed, host);
      }
      return parsed;
    }
  }
  const preferred = Number(process.env.AGENT_GUI_PORT?.trim() || "3000");
  if (strictPort) {
    if (!Number.isFinite(preferred) || preferred <= 0) {
      throw new Error(`Invalid AGENT_GUI_PORT: ${process.env.AGENT_GUI_PORT ?? ""}`);
    }
    await listenProbe(preferred, host);
    return preferred;
  }
  return findAvailablePort(host, preferred);
}

async function resolveQkrpcPort(host) {
  const raw = process.env.QKRPC_PORT?.trim()
    ?? process.env.AGENT_GUI_QKRPC_PORT?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const preferred = Number(process.env.AGENT_GUI_QKRPC_PORT?.trim() || "9477");
  return findAvailablePort(host, preferred);
}

function normalizeBase(url) {
  return url.replace(/\/$/, "");
}

async function checkHealth(base, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${normalizeBase(base)}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
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

async function waitForHealth(base, maxMs = 45_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await checkHealth(base, 2500)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`qkrpc serve did not become ready at ${base}`);
}

function stopQkrpcChild() {
  if (!qkrpcChild || qkrpcChild.killed) return;
  try {
    qkrpcChild.kill();
  } catch {
    // ignore
  }
  qkrpcChild = null;
}

function registerShutdown() {
  const onExit = () => {
    stopQkrpcChild();
  };
  process.on("SIGINT", onExit);
  process.on("SIGTERM", onExit);
  process.on("exit", onExit);
}

async function ensureBundledQkrpcServe(host) {
  if (process.env.AGENT_GUI_SKIP_QKRPC === "1") {
    return null;
  }

  const configured = process.env.QKRPC_HTTP_URL?.trim()
    ?? process.env.QKRPC_HTTP?.trim();

  if (!configured) {
    const defaultPort = Number(process.env.AGENT_GUI_QKRPC_PORT?.trim() || "9477");
    const defaultBase = `http://${host}:${defaultPort}`;
    if (await checkHealth(defaultBase)) {
      console.log(`qkrpc: reusing serve at ${defaultBase}`);
      process.env.QKRPC_HTTP_URL = defaultBase;
      process.env.QKRPC_TRANSPORT = "http";
      return null;
    }
  }

  if (configured) {
    const base = normalizeBase(configured);
    if (await checkHealth(base)) {
      const configuredBin = process.env.QKRPC_BIN?.trim();
      if (
        configuredBin
        && isUserInstalledQkrpcPath(configuredBin)
        && process.env.AGENT_GUI_USE_INSTALLED_QKRPC !== "1"
      ) {
        console.warn(
          `qkrpc: QKRPC_HTTP_URL is healthy but QKRPC_BIN points at user install; starting staged serve instead.`,
        );
      } else {
        console.log(`qkrpc: using existing ${base}`);
        process.env.QKRPC_HTTP_URL = base;
        process.env.QKRPC_TRANSPORT = "http";
        const bin = resolveQkrpcBin(root);
        if (bin) process.env.QKRPC_BIN = bin;
        return null;
      }
    } else {
      console.warn(`qkrpc: QKRPC_HTTP_URL set but ${base} is not healthy; starting staged serve if available.`);
    }
  }

  const staged = ensureStagedQkrpcRuntime(root);
  if (!staged) {
    console.warn(
      "qkrpc: no bundled qkrpc runtime (publish/cli or agent-gui/qkrpc). "
      + "Run build.ps1 -t or publish-rpc.ps1 -SkipInstall, or set QKRPC_HTTP_URL to an external serve.",
    );
    return null;
  }

  const port = await resolveQkrpcPort(host);
  const base = `http://${host}:${port}`;
  const { exe, dir: qkrpcDir } = staged;

  process.env.QKRPC_BIN = exe;
  process.env.QKRPC_HTTP_URL = base;
  process.env.QKRPC_TRANSPORT = "http";

  console.log(`qkrpc: starting staged serve at ${base} (${exe})`);
  qkrpcChild = spawn(
    exe,
    ["serve", "--host", host, "--port", String(port)],
    {
      cwd: qkrpcDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: process.env,
    },
  );

  qkrpcChild.stdout?.on("data", (chunk) => {
    const line = chunk.toString().trimEnd();
    if (line) console.log(`[qkrpc] ${line}`);
  });
  qkrpcChild.stderr?.on("data", (chunk) => {
    const line = chunk.toString().trimEnd();
    if (line) console.error(`[qkrpc] ${line}`);
  });
  qkrpcChild.on("exit", (code, signal) => {
    if (code !== 0 && code !== null && signal !== "SIGTERM") {
      console.error(`qkrpc serve exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
    }
    qkrpcChild = null;
  });

  await waitForHealth(base);
  console.log(`qkrpc: ready at ${base}`);
  return qkrpcChild;
}

function shouldOpenBrowser() {
  if (process.env.AGENT_GUI_OPEN_BROWSER === "0") return false;
  if (process.env.AGENT_GUI_OPEN_BROWSER === "1" || openBrowserCli) return true;
  // beforeDevCommand under `tauri dev` — UI loads in the Tauri webview
  if (process.env.TAURI_ENV_DEBUG === "true") return false;
  return false;
}

function openBrowser(url) {
  if (!shouldOpenBrowser()) return;
  if (process.platform === "win32") {
    exec(`start "" "${url}"`, { shell: true });
  } else if (process.platform === "darwin") {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

function printListening(url) {
  console.log(`quicker-agent: ${url}`);
}

function applyDevWorkspaceEnv(agentGuiRoot) {
  const repoRoot = join(agentGuiRoot, "..");
  if (existsSync(join(repoRoot, "version.json"))) {
    if (!process.env.QKRPC_REPO_ROOT?.trim()) {
      process.env.QKRPC_REPO_ROOT = repoRoot;
    }
    if (!process.env.QKRPC_CWD?.trim()) {
      process.env.QKRPC_CWD = repoRoot;
    }
  } else if (!process.env.QKRPC_CWD?.trim()) {
    process.env.QKRPC_CWD = agentGuiRoot;
  }
}

async function main() {
  registerShutdown();
  const host = process.env.HOSTNAME?.trim() || "127.0.0.1";
  applyDevWorkspaceEnv(root);

  await ensureBundledQkrpcServe(host);

  const port = await resolveUiPort(host);
  process.env.PORT = String(port);
  process.env.HOSTNAME = host;
  const url = `http://${host}:${port}`;

  if (isDev) {
    printListening(url);
    openBrowser(url);
    const nextBin = require.resolve("next/dist/bin/next");
    const nodeExe = resolveNodeExe();
    const child = spawn(
      nodeExe,
      [nextBin, "dev", "--port", String(port), "-H", host],
      { cwd: root, stdio: "inherit", env: process.env },
    );
    child.on("exit", (code) => {
      stopQkrpcChild();
      process.exit(code ?? 1);
    });
    return;
  }

  const serverEntry = join(root, "server.js");
  printListening(url);
  openBrowser(url);
  await import(pathToFileURL(serverEntry).href);
}

main().catch((err) => {
  stopQkrpcChild();
  console.error(err);
  process.exit(1);
});
