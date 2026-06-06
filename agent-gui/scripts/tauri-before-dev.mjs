import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

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
  if (bundler === "turbopack" && !expectingWebpack) {
    console.warn(
      "tauri: port 3000 is serving Turbopack dev — WebView2 will freeze. " +
        "Stop browser dev, then run: pwsh ./start-agent-gui.ps1 -Tauri",
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

function holdProcess() {
  console.log(`tauri: reusing existing frontend at ${baseUrl}`);
  if (process.env.AGENT_GUI_TURBOPACK !== "0") {
    console.warn(
      "tauri: AGENT_GUI_TURBOPACK is not 0 — Turbopack dev + WebView2 may freeze. " +
        "Stop this dev server and run only `pnpm tauri:dev`, or `pnpm dev:webpack` first.",
    );
  }
  setInterval(() => {}, 60_000);
}

function startFrontend() {
  console.log(`tauri: starting frontend (webpack) at ${baseUrl}`);
  const child = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["dev:webpack"],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        AGENT_GUI_PORT: String(port),
        AGENT_GUI_STRICT_PORT: "1",
        AGENT_GUI_OPEN_BROWSER: "0",
        AGENT_GUI_TURBOPACK: "0",
        AGENT_GUI_TAURI_SHELL: "1",
        TAURI_ENV_DEBUG: "true",
      },
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
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
  if (await waitForFrontend()) {
    holdProcess();
    return;
  }

  // Another dev session may already own :3000 while Next is still compiling.
  // Wait longer instead of spawning a second strict-port dev server.
  if (await isPortListening(host, port)) {
    const bundler = readDevBundler();
    if (bundler === "turbopack") {
      throw new Error(
        `Port ${port} is running Turbopack browser dev. Stop it (Ctrl+C), then run: ` +
          "pwsh ./start-agent-gui.ps1 -Tauri",
      );
    }
    console.log(
      `tauri: port ${port} is listening; waiting for ${baseUrl} (webpack compile?)`,
    );
    if (await waitForFrontend(90, 1000)) {
      holdProcess();
      return;
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
  holdProcess();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
