import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const startMjs = join(agentGuiRoot, "start.mjs");

const host = process.env.HOSTNAME?.trim() || "127.0.0.1";
const port = Number(process.env.AGENT_GUI_PORT?.trim() || "3000");
const baseUrl = `http://${host}:${port}`;
const pingUrl = `${baseUrl}/api/ping`;

function isPortListening(targetHost, targetPort) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: targetHost, port: targetPort });
    const done = (listening) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(listening);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(1200, () => done(false));
  });
}

function readDevBundler() {
  try {
    const raw = readFileSync(
      join(agentGuiRoot, ".local", "dev-server.json"),
      "utf8",
    );
    const data = JSON.parse(raw);
    return data?.bundler === "webpack" || data?.bundler === "turbopack"
      ? data.bundler
      : null;
  } catch {
    return null;
  }
}

function shouldReuseExistingDev() {
  return process.env.AGENT_GUI_REUSE_DEV === "1";
}

/** True while this process is spawning webpack (stale turbopack hint in dev-server.json). */
let expectingWebpack = false;

function markExpectingWebpackDev() {
  expectingWebpack = true;
  try {
    mkdirSync(join(agentGuiRoot, ".local"), { recursive: true });
    writeFileSync(
      join(agentGuiRoot, ".local", "dev-server.json"),
      `${JSON.stringify({
        url: baseUrl,
        port,
        host,
        bundler: "webpack",
        startedAt: new Date().toISOString(),
      }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // best-effort; HTTP probe still decides readiness
  }
}

async function hasRunningFrontend() {
  const bundler = readDevBundler();
  if (bundler === "turbopack" && !expectingWebpack && !shouldReuseExistingDev()) {
    console.warn(
      "tauri: port 3000 is serving Turbopack dev — attach with browser dev still running: " +
        "pwsh ./dev.ps1 -Tauri (reuses :3000; HMR muted in WebView2).",
    );
    return false;
  }

  // First webpack compile of `/` can take 30–120s; short probes cause false negatives.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const rootRes = await fetch(baseUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return rootRes.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function tauriFrontendEnv() {
  return {
    ...process.env,
    AGENT_GUI_PORT: String(port),
    AGENT_GUI_STRICT_PORT: "1",
    AGENT_GUI_OPEN_BROWSER: "0",
    AGENT_GUI_TURBOPACK: "0",
    AGENT_GUI_TAURI_SHELL: "1",
    TAURI_ENV_DEBUG: "true",
  };
}

/** External dev server keeps running in another terminal; Tauri only needs devUrl reachable. */
function finishReuseFrontend() {
  const bundler = readDevBundler();
  console.log(`tauri: reusing existing frontend at ${baseUrl}`);
  if (bundler === "turbopack" || process.env.AGENT_GUI_TURBOPACK !== "0") {
    console.log(
      "tauri: Turbopack browser dev — HMR muted in WebView2; refresh the desktop window after edits.",
    );
  }
  process.exit(0);
}

function startFrontend() {
  console.log(`tauri: starting frontend (webpack) at ${baseUrl}`);
  const child = spawn(
    process.execPath,
    [startMjs, "--dev", "--webpack"],
    {
      cwd: agentGuiRoot,
      stdio: "inherit",
      env: tauriFrontendEnv(),
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    if ((code ?? 1) !== 0) {
      console.error(
        "tauri: webpack dev exited before ready — check compile errors above " +
          "or free port 3000 and retry.",
      );
    }
    process.exit(code ?? 1);
  });
}

/** Keep beforeDevCommand alive while the webpack child from startFrontend() runs. */
function holdUntilFrontendChildExits() {
  setInterval(() => {}, 60_000);
}

async function waitForFrontend(maxAttempts = 15, intervalMs = 1000) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await hasRunningFrontend()) return true;
    if (attempt + 1 < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  return false;
}

async function main() {
  if (shouldReuseExistingDev() && await waitForFrontend()) {
    finishReuseFrontend();
    return;
  }

  // Another dev session may already own :3000 while Next is still compiling.
  // Wait longer instead of spawning a second strict-port dev server.
  if (await isPortListening(host, port)) {
    const bundler = readDevBundler();
    if (bundler === "turbopack" && !shouldReuseExistingDev()) {
      throw new Error(
        `Port ${port} is running Turbopack browser dev. Attach without stopping it: ` +
          "pwsh ./dev.ps1 -Tauri",
      );
    }
    console.log(
      `tauri: port ${port} is listening; waiting for ${baseUrl} (webpack compile?)`,
    );
    if (await waitForFrontend(120, 1000)) {
      if (shouldReuseExistingDev()) {
        finishReuseFrontend();
        return;
      }
      throw new Error(
        `Port ${port} is already serving ${baseUrl}. ` +
          "Stop the other agent-gui dev, or start browser dev first and attach: " +
          "pwsh ./dev.ps1 -Tauri",
      );
    }
    throw new Error(
      `Frontend port ${port} is in use but ${baseUrl} did not become healthy. ` +
        "Stop the other agent-gui dev process or free the port, then retry.",
    );
  }

  markExpectingWebpackDev();
  startFrontend();
  console.log(
    `tauri: waiting for ${baseUrl} (webpack first compile may take a few minutes)…`,
  );
  if (!(await waitForFrontend(240, 2000))) {
    throw new Error(
      `Frontend at ${baseUrl} did not become healthy within 8 minutes. ` +
        "Check the webpack dev terminal for compile errors.",
    );
  }
  console.log(`tauri: frontend ready at ${baseUrl}`);
  holdUntilFrontendChildExits();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
