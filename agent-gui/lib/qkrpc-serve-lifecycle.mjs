import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, normalize } from "node:path";

const STATE_FILE = "qkrpc-serve.json";

/** @typedef {{ pid: number; runtimeDir?: string; port?: number; ownerPid: number; startedAt: number }} QkrpcServeState */

export function qkrpcServeStatePath(agentGuiRoot) {
  return join(agentGuiRoot, ".runtime", STATE_FILE);
}

/** @returns {QkrpcServeState | null} */
export function readQkrpcServeState(agentGuiRoot) {
  const path = qkrpcServeStatePath(agentGuiRoot);
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
      runtimeDir: typeof raw?.runtimeDir === "string" ? raw.runtimeDir : undefined,
      port: Number.isInteger(Number(raw?.port)) ? Number(raw.port) : undefined,
    };
  } catch {
    return null;
  }
}

/** @param {QkrpcServeState} state */
export function writeQkrpcServeState(agentGuiRoot, state) {
  const path = qkrpcServeStatePath(agentGuiRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state)}\n`, "utf8");
}

export function clearQkrpcServeState(agentGuiRoot) {
  const path = qkrpcServeStatePath(agentGuiRoot);
  if (!existsSync(path)) return;
  try {
    rmSync(path, { force: true });
  } catch {
    // ignore
  }
}

/** @returns {boolean} */
export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return /** @type {NodeJS.ErrnoException} */ (err).code === "EPERM";
  }
}

/** @param {number} pid */
export function killProcessTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        process.kill(pid, "SIGTERM");
      }
    }
  } catch {
    // already exited or access denied
  }
}

/**
 * @param {string} runtimeDir
 * @returns {number[]}
 */
export function listQkrpcServePidsForRuntimeDir(runtimeDir) {
  const normalized = normalize(runtimeDir);
  if (process.platform === "win32") {
    return listQkrpcServePidsWindows(normalized);
  }
  return listQkrpcServePidsUnix(normalized);
}

/** @param {string} runtimeDir */
function listQkrpcServePidsWindows(runtimeDir) {
  const prefix = runtimeDir.toLowerCase().replace(/'/g, "''");
  const script = [
    "Get-CimInstance Win32_Process",
    "| Where-Object { $_.Name -eq 'qkrpc.exe' -and $_.ExecutablePath -and $_.ExecutablePath.ToLower().StartsWith('",
    prefix,
    "') }",
    "| Select-Object -ExpandProperty ProcessId",
  ].join(" ");
  try {
    const out = execSync(`powershell -NoProfile -Command "${script}"`, {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    if (!out) return [];
    return out
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

/** @param {string} runtimeDir */
function listQkrpcServePidsUnix(runtimeDir) {
  try {
    const out = execSync(`pgrep -f "${runtimeDir.replace(/"/g, '\\"')}"`, {
      encoding: "utf8",
    }).trim();
    if (!out) return [];
    return out
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

/**
 * Stop orphaned qkrpc serve from a prior agent-gui session (e.g. force-killed parent).
 * @param {string} agentGuiRoot
 * @param {{ runtimeDir?: string }} [options]
 */
export function reconcileStaleQkrpcServe(agentGuiRoot, options = {}) {
  const runtimeDir = options.runtimeDir
    ? normalize(options.runtimeDir)
    : join(agentGuiRoot, ".runtime", "qkrpc");

  const state = readQkrpcServeState(agentGuiRoot);
  const toKill = new Set();

  if (state) {
    const ownerAlive = isProcessAlive(state.ownerPid);
    const serveAlive = isProcessAlive(state.pid);
    if (serveAlive && !ownerAlive) {
      if (
        !state.runtimeDir
        || normalize(state.runtimeDir) === runtimeDir
      ) {
        toKill.add(state.pid);
      }
    } else if (!serveAlive) {
      clearQkrpcServeState(agentGuiRoot);
    }
  }

  for (const pid of listQkrpcServePidsForRuntimeDir(runtimeDir)) {
    if (
      state?.pid === pid
      && state.ownerPid === process.pid
      && isProcessAlive(state.ownerPid)
    ) {
      continue;
    }
    if (
      state?.pid === pid
      && state.ownerPid !== process.pid
      && isProcessAlive(state.ownerPid)
    ) {
      continue;
    }
    toKill.add(pid);
  }

  if (toKill.size === 0) return false;

  for (const pid of toKill) {
    killProcessTree(pid);
  }

  clearQkrpcServeState(agentGuiRoot);
  return true;
}

/**
 * @param {string} agentGuiRoot
 * @param {import('node:child_process').ChildProcess} child
 * @param {{ runtimeDir?: string; port?: number }} meta
 */
export function trackQkrpcServeChild(agentGuiRoot, child, meta = {}) {
  const pid = child.pid;
  if (!pid) return;

  writeQkrpcServeState(agentGuiRoot, {
    pid,
    ownerPid: process.pid,
    startedAt: Date.now(),
    runtimeDir: meta.runtimeDir,
    port: meta.port,
  });

  child.on("exit", () => {
    const current = readQkrpcServeState(agentGuiRoot);
    if (current?.pid === pid) {
      clearQkrpcServeState(agentGuiRoot);
    }
  });
}

/**
 * @param {string} agentGuiRoot
 * @param {import('node:child_process').ChildProcess | null | undefined} child
 */
export function stopTrackedQkrpcServe(agentGuiRoot, child) {
  if (child?.pid && !child.killed) {
    killProcessTree(child.pid);
  }
  clearQkrpcServeState(agentGuiRoot);
}
