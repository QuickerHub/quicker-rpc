/**
 * Electron dev entry: ensure :3000 frontend, then launch Electron shell.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { resolveElectronCli } from "./ensure-electron-binary.mjs";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const startMjs = join(agentGuiRoot, "start.mjs");

const host = process.env.HOSTNAME?.trim() || "127.0.0.1";
const port = Number(process.env.AGENT_GUI_PORT?.trim() || "3000");
const baseUrl = `http://${host}:${port}`;
const pingUrl = `${baseUrl}/api/ping`;

process.env.ELECTRON_DEV = "1";
process.env.AGENT_GUI_ELECTRON_SHELL = "1";
process.env.AGENT_GUI_TURBOPACK ??= "0";

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

async function fetchOk(url, timeoutMs = 2500) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function hasRunningFrontend() {
  return fetchOk(pingUrl) || fetchOk(baseUrl);
}

function shouldReuseExistingDev() {
  return process.env.AGENT_GUI_REUSE_DEV === "1";
}

function electronFrontendEnv() {
  const env = {
    ...process.env,
    AGENT_GUI_PORT: String(port),
    AGENT_GUI_STRICT_PORT: "1",
    AGENT_GUI_OPEN_BROWSER: "0",
    AGENT_GUI_TURBOPACK: "0",
    AGENT_GUI_ELECTRON_SHELL: "1",
    ELECTRON_DEV: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

async function waitForFrontend(maxAttempts = 120, intervalMs = 1000) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (await hasRunningFrontend()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** Webpack dev serves lazy chunks only after the route compiles — ping alone is too early. */
async function waitForHomePageChunk(maxAttempts = 180, intervalMs = 1000) {
  const chunkUrl = `${baseUrl}/_next/static/chunks/app/page.js`;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await fetch(baseUrl, { signal: AbortSignal.timeout(60_000) });
    } catch {
      // route still compiling
    }
    try {
      const res = await fetch(chunkUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return true;
    } catch {
      // chunk not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** @returns {import('node:child_process').ChildProcess | null} */
function startWebpackFrontend() {
  console.log(`electron: starting frontend (webpack) at ${baseUrl}`);
  return spawn(process.execPath, [startMjs, "--dev", "--webpack"], {
    cwd: agentGuiRoot,
    stdio: "inherit",
    env: electronFrontendEnv(),
  });
}

function launchElectron() {
  const cli = resolveElectronCli();
  if (!cli) {
    throw new Error(
      "electron-binary not installed — run pnpm install in agent-gui (needs electron-binary postinstall)",
    );
  }
  console.log(`electron: opening desktop shell → ${baseUrl}`);
  return spawn(process.execPath, [cli, ".", "--dev"], {
    stdio: "inherit",
    env: electronFrontendEnv(),
    cwd: agentGuiRoot,
  });
}

async function ensureFrontend() {
  if (shouldReuseExistingDev() && (await hasRunningFrontend())) {
    console.log(`electron: reusing existing frontend at ${baseUrl}`);
    return null;
  }

  if (await isPortListening(host, port)) {
    console.log(`electron: waiting for ${baseUrl} (compile?)…`);
    if (await waitForFrontend(120, 1000)) {
      if (!(await waitForHomePageChunk(120, 1000))) {
        throw new Error(
          `Port ${port} serves ${baseUrl} but app/page.js chunk is missing (stale .next?). ` +
            "Stop dev, delete agent-gui/.next, and retry.",
        );
      }
      if (shouldReuseExistingDev()) {
        console.log(`electron: reusing existing frontend at ${baseUrl}`);
        return null;
      }
      throw new Error(
        `Port ${port} already serves ${baseUrl}. Stop the other dev or run ` +
          "pwsh ./dev.ps1 first, then pwsh ./dev.ps1 -Electron",
      );
    }
    throw new Error(
      `Port ${port} is in use but ${baseUrl} did not become healthy.`,
    );
  }

  const child = startWebpackFrontend();
  if (!(await waitForFrontend(180, 1000))) {
    throw new Error(`Frontend ${baseUrl} did not become healthy.`);
  }
  console.log("electron: waiting for home page chunk (webpack compile)…");
  if (!(await waitForHomePageChunk(180, 1000))) {
    throw new Error(
      `Frontend ${baseUrl} is up but app/page.js chunk did not compile.`,
    );
  }
  return child;
}

async function main() {
  const frontendChild = await ensureFrontend();
  const electronChild = launchElectron();

  const cleanup = (code) => {
    if (frontendChild && !shouldReuseExistingDev()) {
      try {
        frontendChild.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    process.exit(code ?? 0);
  };

  electronChild.on("exit", (code, signal) => {
    if (signal) {
      cleanup(1);
      return;
    }
    cleanup(code ?? 1);
  });

  if (frontendChild) {
    frontendChild.on("exit", (code) => {
      if ((code ?? 0) !== 0) {
        console.error("electron: webpack dev exited unexpectedly");
        try {
          electronChild.kill("SIGTERM");
        } catch {
          // ignore
        }
      }
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
