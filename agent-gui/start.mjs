/**
 * Start bundled qkrpc serve (if present) + agent-gui dev server.
 * Usage: node start.mjs [--dev] [--open-browser]
 */
import { exec, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  isUserInstalledQkrpcPath,
  resolveQkrpcBin,
  resolveServeQkrpcRuntime,
} from "./lib/qkrpc-bin.mjs";
import { applyQkrpcToolchainEnv } from "./lib/qkrpc-toolchain-env.mjs";
import {
  reconcileStaleQkrpcServe,
  stopTrackedQkrpcServe,
  trackQkrpcServeChild,
} from "./lib/qkrpc-serve-lifecycle.mjs";
import { discoverHealthyQkrpcServe } from "./lib/qkrpc-serve-discover.mjs";
import {
  writeDevServerInfo,
  wireNextDevOutput,
} from "./lib/dev-frontend-log-parser.mjs";
import {
  ensureVoiceRuntime,
  stopTrackedVoiceRuntime,
} from "./lib/voice-runtime-lifecycle.mjs";
import {
  stopTrackedBrowserRuntime,
} from "./lib/browser-runtime-lifecycle.mjs";
import {
  ensureTerminalRuntime,
  stopTrackedTerminalRuntime,
} from "./lib/terminal-runtime-lifecycle.mjs";
import { stopStaleAgentGuiDev } from "./scripts/stop-agent-gui-dev.mjs";
import {
  nextCacheHasBrokenTurbopackRuntime,
  nextCacheIsCorrupt,
  describeNextCacheCorruption,
} from "./lib/next-cache-health.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function readDocumentJs(nextDir) {
  const documentJs = join(nextDir, "server", "pages", "_document.js");
  if (!existsSync(documentJs)) {
    return null;
  }
  try {
    return readFileSync(documentJs, "utf8");
  } catch {
    return null;
  }
}

function nextCacheHasTurbopackRuntimeChunk(nextDir) {
  if (existsSync(join(nextDir, "turbopack"))) {
    return true;
  }
  try {
    const ssrChunks = join(nextDir, "server", "chunks", "ssr");
    return readdirSync(ssrChunks).some((name) =>
      name.includes("[turbopack]_runtime"),
    );
  } catch {
    return false;
  }
}

function nextCacheReferencesTurbopackRuntime(nextDir) {
  const documentJs = readDocumentJs(nextDir);
  return documentJs?.includes("[turbopack]_runtime") === true;
}

function nextCacheLooksLikeTurbopack(nextDir) {
  return (
    nextCacheHasTurbopackRuntimeChunk(nextDir)
    || nextCacheReferencesTurbopackRuntime(nextDir)
  );
}

function nextCacheLooksLikeWebpack(nextDir) {
  if (existsSync(join(nextDir, "cache", "webpack"))) {
    return true;
  }
  if (nextCacheLooksLikeTurbopack(nextDir)) {
    return false;
  }
  try {
    const ssrChunks = join(nextDir, "server", "chunks", "ssr");
    return readdirSync(ssrChunks).length > 0;
  } catch {
    return false;
  }
}

/** Turbopack/webpack artifacts must not share the same .next folder. */
function clearNextCacheIfBundlerChanged(targetBundler) {
  const nextDir = join(root, ".next");
  if (!existsSync(nextDir)) {
    return;
  }

  const infoPath = join(root, ".local", "dev-server.json");
  let prevBundler = null;
  try {
    const prev = JSON.parse(readFileSync(infoPath, "utf8"));
    prevBundler = prev?.bundler === "webpack" || prev?.bundler === "turbopack"
      ? prev.bundler
      : null;
  } catch {
    // first dev session or unreadable snapshot
  }

  const bundlerSwitched = prevBundler != null && prevBundler !== targetBundler;
  const brokenTurbopack = nextCacheHasBrokenTurbopackRuntime(nextDir);
  const webpackNeedsCleanCache =
    targetBundler === "webpack" && nextCacheLooksLikeTurbopack(nextDir);
  const turbopackNeedsCleanCache =
    targetBundler === "turbopack"
    && (nextCacheLooksLikeWebpack(nextDir) || brokenTurbopack);

  const corruptDevCache = nextCacheIsCorrupt(nextDir);

  if (
    bundlerSwitched
    || webpackNeedsCleanCache
    || turbopackNeedsCleanCache
    || corruptDevCache
  ) {
    const reason = corruptDevCache
      ? describeNextCacheCorruption(nextDir)
      : brokenTurbopack
        ? "repaired broken Turbopack runtime cache"
        : bundlerSwitched
          ? `was ${prevBundler}, starting ${targetBundler}`
          : targetBundler === "webpack"
            ? "removed stale Turbopack artifacts for webpack"
            : "removed stale webpack artifacts for Turbopack";
    rmSync(nextDir, { recursive: true, force: true });
    console.log(`next: cleared .next (${reason})`);
  }
}
const isDev = process.argv.includes("--dev");
const devFullRuntimes = process.argv.includes("--full-runtimes");
const devWebpack = process.argv.includes("--webpack");
const openBrowserCli = process.argv.includes("--open-browser");

/** Prefer portable Node shipped in publish package. */
function resolveNodeExe() {
  const bundled = join(root, "node", "node.exe");
  if (existsSync(bundled)) return bundled;
  return process.execPath;
}

/** @type {import('node:child_process').ChildProcess | null} */
let qkrpcChild = null;
/** @type {import('node:child_process').ChildProcess | null} */
let voiceChild = null;
/** @type {import('node:child_process').ChildProcess | null} */
let browserChild = null;
/** @type {import('node:child_process').ChildProcess | null} */
let terminalChild = null;
/** @type {import('node:child_process').ChildProcess | null} */
let nextDevChild = null;
/** @type {{ port: number, host: string, useTurbo: boolean } | null} */
let nextDevConfig = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let nextDevRecoveryTimer = null;
let nextDevRecoveryInFlight = false;
let nextDevRecoveryCount = 0;
const NEXT_DEV_RECOVERY_LIMIT = 3;

/** @param {import('node:child_process').ChildProcess | null} child @param {number} timeoutMs */
function waitForProcessExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (!child || child.exitCode != null) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function onNextDevExit(code) {
  if (nextDevRecoveryInFlight) return;
  stopQkrpcChild();
  stopVoiceChild();
  stopBrowserChild();
  process.exit(code ?? 1);
}

/** @param {{ port: number, host: string, useTurbo: boolean }} config */
function startNextDevServer(config) {
  const nextBin = require.resolve("next/dist/bin/next");
  const nodeExe = resolveNodeExe();
  const nextArgs = ["dev", "--port", String(config.port), "-H", config.host];
  if (config.useTurbo) {
    nextArgs.push("--turbo");
  } else {
    console.log("next: webpack dev (AGENT_GUI_TURBOPACK=0)");
  }
  const child = spawn(
    nodeExe,
    [nextBin, ...nextArgs],
    { cwd: root, stdio: ["inherit", "pipe", "pipe"], env: process.env },
  );
  wireNextDevOutput(root, child, {
    onCorruptCache: scheduleNextDevRecovery,
  });
  child.on("exit", onNextDevExit);
  return child;
}

function scheduleNextDevRecovery() {
  if (nextDevRecoveryInFlight || nextDevRecoveryTimer || !nextDevConfig) {
    return;
  }
  if (nextDevRecoveryCount >= NEXT_DEV_RECOVERY_LIMIT) {
    console.error(
      "next: corrupt .next cache keeps recurring; stop dev and run: pwsh ./dev.ps1 -Tauri",
    );
    return;
  }
  nextDevRecoveryTimer = setTimeout(() => {
    nextDevRecoveryTimer = null;
    void recoverNextDevServer();
  }, 1800);
}

async function recoverNextDevServer() {
  if (nextDevRecoveryInFlight || !nextDevConfig) return;
  nextDevRecoveryInFlight = true;
  nextDevRecoveryCount += 1;
  console.warn(
    "next: corrupt .next cache detected (ENOENT manifest); clearing and restarting dev server…",
  );
  rmSync(join(root, ".next"), { recursive: true, force: true });
  if (nextDevChild && nextDevChild.exitCode == null) {
    nextDevChild.removeAllListeners("exit");
    nextDevChild.kill("SIGTERM");
    const exited = await waitForProcessExit(nextDevChild, 5000);
    if (!exited && nextDevChild.exitCode == null) {
      nextDevChild.kill("SIGKILL");
      await waitForProcessExit(nextDevChild, 2000);
    }
  }
  nextDevChild = startNextDevServer(nextDevConfig);
  nextDevRecoveryInFlight = false;
}

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
  const base =
    Number.isFinite(preferred) && preferred > 0 ? preferred : defaultUiPort();
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

function defaultUiPort() {
  // Keep 3000 for dev and bundled UI so chat localStorage origin stays stable across upgrades.
  return 3000;
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
        return parsed;
      }
      try {
        await listenProbe(parsed, host);
        return parsed;
      } catch {
        // PORT inherited or stale — pick next free port below.
      }
    }
  }
  const preferred = Number(
    process.env.AGENT_GUI_PORT?.trim() || String(defaultUiPort()),
  );
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

/** qkrpc serve is up when /health returns JSON with boolean ok (Quicker may be offline). */
async function checkQkrpcListening(base, timeoutMs = 3000) {
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

async function checkHealth(base, timeoutMs = 3000) {
  return checkQkrpcListening(base, timeoutMs);
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
  stopTrackedQkrpcServe(root, qkrpcChild);
  qkrpcChild = null;
}

function stopVoiceChild() {
  stopTrackedVoiceRuntime(root, voiceChild);
  voiceChild = null;
}

function stopBrowserChild() {
  stopTrackedBrowserRuntime(root, browserChild);
  browserChild = null;
}

function stopTerminalChild() {
  stopTrackedTerminalRuntime(root, terminalChild);
  terminalChild = null;
}

function registerShutdown() {
  const onExit = () => {
    stopQkrpcChild();
    stopVoiceChild();
    stopBrowserChild();
    stopTerminalChild();
  };
  process.on("SIGINT", onExit);
  process.on("SIGTERM", onExit);
  process.on("exit", onExit);
}

async function ensureBundledQkrpcServe(host) {
  if (process.env.AGENT_GUI_SKIP_QKRPC === "1") {
    return null;
  }

  reconcileStaleQkrpcServe(root);

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
      console.warn(`qkrpc: QKRPC_HTTP_URL set but ${base} is not healthy; scanning for serve.`);
    }
  }

  const discovered = await discoverHealthyQkrpcServe(host);
  if (discovered) {
    console.log(`qkrpc: reusing discovered serve at ${discovered.baseUrl}`);
    const bin = resolveQkrpcBin(root);
    if (bin) process.env.QKRPC_BIN = bin;
    return null;
  }

  const runtime = resolveServeQkrpcRuntime(root);
  if (!runtime) {
    console.warn(
      "qkrpc: no qkrpc runtime for serve (repo build, publish/cli, or %LOCALAPPDATA%\\Programs\\qkrpc). "
      + "Run pwsh ./build.ps1 -t from repo root, or set QKRPC_HTTP_URL to an external serve.",
    );
    return null;
  }

  const port = await resolveQkrpcPort(host);
  const base = `http://${host}:${port}`;
  const { exe, dir: qkrpcDir, source: runtimeSource } = runtime;

  process.env.QKRPC_BIN = exe;
  process.env.QKRPC_HTTP_URL = base;
  process.env.QKRPC_TRANSPORT = "http";

  console.log(`qkrpc: starting serve at ${base} (${exe}, source=${runtimeSource})`);
  qkrpcChild = spawn(
    exe,
    ["serve", "--host", host, "--port", String(port), "--no-bootstrap"],
    {
      cwd: qkrpcDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: process.env,
    },
  );
  trackQkrpcServeChild(root, qkrpcChild, { runtimeDir: qkrpcDir, port });

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
  const inRepo = existsSync(join(repoRoot, "version.json"));
  const cwd = inRepo ? repoRoot : agentGuiRoot;
  applyQkrpcToolchainEnv(process.env, {
    agentGuiRoot,
    cwd,
    repoRoot: inRepo ? repoRoot : undefined,
  });
}

async function main() {
  registerShutdown();
  const host = process.env.HOSTNAME?.trim() || "127.0.0.1";
  applyDevWorkspaceEnv(root);

  const tauriShellBoot = process.env.AGENT_GUI_TAURI_SHELL === "1";
  if (tauriShellBoot && isDev) {
    // Tauri shell: start Next immediately; qkrpc lazy-starts on first /api/ping.
    console.log("qkrpc: deferred for Tauri dev boot (lazy via /api/ping)");
  } else {
    await ensureBundledQkrpcServe(host);
  }

  if (isDev) {
    if (process.env.AGENT_GUI_SKIP_KILL !== "1") {
      // tauri-before-dev already stopped stale dev; do not kill the parent Tauri session.
      if (process.env.AGENT_GUI_TAURI_SHELL !== "1") {
        await stopStaleAgentGuiDev({
          agentGuiRoot: root,
          repoRoot: join(root, ".."),
        });
      }
    }
    delete process.env.PORT;

    const startVoiceAtBoot =
      process.env.AGENT_GUI_VOICE_RUNTIME === "1"
      || devFullRuntimes;
    if (startVoiceAtBoot) {
      voiceChild = await ensureVoiceRuntime(root, host);
    } else {
      console.log(
        "voice: skipped at dev boot (lazy-start on first use; AGENT_GUI_VOICE_RUNTIME=1 or pnpm dev:full to eager-start)",
      );
    }
    // Browser runtime lazy-starts on first tool/API invoke (see browser-runtime-client.server.ts).
    if (process.env.AGENT_GUI_SKIP_TERMINAL_RUNTIME !== "1") {
      void ensureTerminalRuntime(root, host)
        .then((child) => {
          terminalChild = child;
        })
        .catch((err) => {
          console.warn(
            `terminal: dev boot warm-up failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
  }

  const port = await resolveUiPort(host);
  process.env.PORT = String(port);
  process.env.HOSTNAME = host;
  const url = `http://${host}:${port}`;

  if (isDev) {
    const useTurbo = process.env.AGENT_GUI_TURBOPACK !== "0" && !devWebpack;
    const bundler = useTurbo ? "turbopack" : "webpack";
    clearNextCacheIfBundlerChanged(bundler);
    printListening(url);
    writeDevServerInfo(root, {
      url,
      port,
      host,
      bundler,
    });
    openBrowser(url);
    nextDevConfig = { port, host, useTurbo };
    nextDevChild = startNextDevServer(nextDevConfig);
    return;
  }

  const serverEntry = join(root, "server.js");
  printListening(url);
  openBrowser(url);
  await import(pathToFileURL(serverEntry).href);
}

main().catch((err) => {
  stopQkrpcChild();
  stopVoiceChild();
  stopBrowserChild();
  stopTerminalChild();
  console.error(err);
  process.exit(1);
});
