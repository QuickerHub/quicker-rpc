import { spawn } from "node:child_process";

const host = process.env.HOSTNAME?.trim() || "127.0.0.1";
const port = Number(process.env.AGENT_GUI_PORT?.trim() || "3000");
const baseUrl = `http://${host}:${port}`;
const pingUrl = `${baseUrl}/api/ping`;

async function hasRunningFrontend() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1800);
  try {
    const res = await fetch(pingUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function holdProcess() {
  console.log(`tauri: reusing existing frontend at ${baseUrl}`);
  setInterval(() => {}, 60_000);
}

function startFrontend() {
  console.log(`tauri: starting frontend at ${baseUrl}`);
  const child = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["dev"],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        AGENT_GUI_PORT: String(port),
        AGENT_GUI_STRICT_PORT: "1",
        AGENT_GUI_OPEN_BROWSER: "0",
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
  startFrontend();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
