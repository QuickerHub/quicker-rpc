import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { killChildTree } from "../backend-spawn.mjs";
import { clipboardHistoryPluginRoot } from "../quicker-agent-paths.mjs";
import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  DEFAULT_RUNTIME_EXE,
  RUNTIME_READY_WAIT_MS,
} from "./constants.mjs";
import { devRuntimeDir, devRuntimeExe } from "./paths-dev.mjs";

/** @type {import('node:child_process').ChildProcess | null} */
let runtimeChild = null;

export function clipboardHttpPort() {
  const raw =
    process.env.QUICKER_CLIPBOARD_PORT?.trim()
    || process.env.AGENT_GUI_CLIPBOARD_PORT?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HTTP_PORT;
}

function childStillRunning(child) {
  if (!child?.pid) return false;
  try {
    process.kill(child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function reconcileChild() {
  if (runtimeChild && !childStillRunning(runtimeChild)) {
    runtimeChild = null;
  }
}

export function isClipboardRuntimeOwnedRunning() {
  reconcileChild();
  return runtimeChild !== null && childStillRunning(runtimeChild);
}

export async function fetchClipboardRuntimeHealth(port = clipboardHttpPort()) {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2_000);
    const res = await fetch(`http://${DEFAULT_HTTP_HOST}:${port}/health`, {
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, ready: false };
    const body = await res.json();
    const ok = body.ok === true && body.ready === true;
    return { ok, ready: ok };
  } catch {
    return { ok: false, ready: false };
  }
}

function readManifest(root) {
  try {
    return JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

function runtimeExeRelative(manifest) {
  const rel = manifest?.runtime?.exe;
  return typeof rel === "string" && rel.trim() ? rel.trim() : DEFAULT_RUNTIME_EXE;
}

export function isClipboardInstalled(root = clipboardHistoryPluginRoot()) {
  return (
    existsSync(join(root, "manifest.json"))
    && existsSync(join(root, DEFAULT_RUNTIME_EXE))
  );
}

function dataDirForRoot(root) {
  return join(root, "data");
}

function killListenerOnPort(port) {
  if (process.platform !== "win32") return;
  const script = `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`;
  spawn("powershell", ["-NoProfile", "-Command", script], {
    stdio: "ignore",
    windowsHide: true,
  });
}

function killClipboardRuntimeProcesses() {
  if (process.platform !== "win32") return;
  spawn("taskkill", ["/F", "/IM", "quicker-clipboard-history.exe"], {
    stdio: "ignore",
    windowsHide: true,
  });
}

function spawnInstalledRuntime(root, exeRel, port) {
  const exe = join(root, exeRel);
  if (!existsSync(exe)) {
    throw new Error(`Runtime 不存在：${exe}`);
  }
  const dataDir = dataDirForRoot(root);
  mkdirSync(dataDir, { recursive: true });
  const child = spawn(
    exe,
    ["--host", DEFAULT_HTTP_HOST, "--port", String(port), "--data-dir", dataDir],
    {
      cwd: root,
      env: {
        ...process.env,
        QUICKER_CLIPBOARD_DATA_DIR: dataDir,
        QUICKER_CLIPBOARD_PORT: String(port),
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  runtimeChild = child;
  child.on("exit", () => {
    if (runtimeChild === child) runtimeChild = null;
  });
  return child;
}

function spawnDevRuntime(devDir, port) {
  const dataDir = join(clipboardHistoryPluginRoot(), "data");
  mkdirSync(dataDir, { recursive: true });
  const devExe = devRuntimeExe();
  const cmd = devExe ?? "cargo";
  const args = devExe
    ? ["--host", DEFAULT_HTTP_HOST, "--port", String(port), "--data-dir", dataDir]
    : [
        "run",
        "--quiet",
        "--",
        "--host",
        DEFAULT_HTTP_HOST,
        "--port",
        String(port),
        "--data-dir",
        dataDir,
      ];
  const child = spawn(cmd, args, {
    cwd: devDir,
    env: {
      ...process.env,
      QUICKER_CLIPBOARD_DATA_DIR: dataDir,
      QUICKER_CLIPBOARD_PORT: String(port),
    },
    stdio: "ignore",
    windowsHide: true,
  });
  runtimeChild = child;
  child.on("exit", () => {
    if (runtimeChild === child) runtimeChild = null;
  });
  return child;
}

async function waitRuntimeReady(port, maxMs = RUNTIME_READY_WAIT_MS) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const health = await fetchClipboardRuntimeHealth(port);
    if (health.ok && health.ready) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`剪贴板 Runtime 未就绪（${DEFAULT_HTTP_HOST}:${port}/health）`);
}

export async function ensureClipboardRuntime() {
  reconcileChild();
  const port = clipboardHttpPort();
  const health = await fetchClipboardRuntimeHealth(port);
  if (health.ok && health.ready) return;

  if (isClipboardRuntimeOwnedRunning()) {
    await waitRuntimeReady(port);
    return;
  }

  killListenerOnPort(port);
  await new Promise((r) => setTimeout(r, 300));

  const root = clipboardHistoryPluginRoot();
  if (isClipboardInstalled(root)) {
    const manifest = readManifest(root);
    spawnInstalledRuntime(root, runtimeExeRelative(manifest), port);
  } else {
    const devDir = devRuntimeDir();
    if (!devDir) {
      throw new Error("剪贴板 Runtime 不可用：请构建 clipboard-history-runtime 或安装插件。");
    }
    spawnDevRuntime(devDir, port);
  }
  await waitRuntimeReady(port);
}

export function shutdownClipboardHistory(fast = false) {
  if (runtimeChild) {
    killChildTree(runtimeChild);
    runtimeChild = null;
  }
  if (!fast) {
    killListenerOnPort(clipboardHttpPort());
    killClipboardRuntimeProcesses();
  }
}
