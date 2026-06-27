import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { dirname, join, normalize } from "node:path";
import {
  listConsoleReleaseOutputDirs,
} from "./repo-paths.mjs";
import {
  reconcileStaleQkrpcServe,
  stopQkrpcServeForRuntimeDir,
} from "./qkrpc-serve-lifecycle.mjs";

const QKRPC_EXE = process.platform === "win32" ? "qkrpc.exe" : "qkrpc";

/** `%LOCALAPPDATA%\\Programs\\qkrpc\\qkrpc.exe` from build.ps1 -t / setup.exe. */
export function resolveUserInstalledQkrpcExe() {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (!localAppData) return null;
  const exe = join(localAppData, "Programs", "qkrpc", QKRPC_EXE);
  return existsSync(exe) ? exe : null;
}

/** qkrpc on PATH (terminal `qkrpc` works but setup dir is missing). */
export function resolveQkrpcFromPath() {
  try {
    if (process.platform === "win32") {
      const out = execSync("where.exe qkrpc", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      for (const line of out.split(/\r?\n/)) {
        const candidate = line.trim();
        if (candidate && existsSync(candidate)) {
          return candidate;
        }
      }
      return null;
    }
    const out = execSync("command -v qkrpc", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out && existsSync(out) ? out : null;
  } catch {
    return null;
  }
}

/** User-installed CLI (`build.ps1 -t` / setup.exe). Agent-gui must not run serve from here. */
export function isUserInstalledQkrpcPath(exePath) {
  const normalized = normalize(exePath).toLowerCase();
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (!localAppData) return false;
  const installRoot = normalize(join(localAppData, "Programs", "qkrpc")).toLowerCase();
  return normalized === installRoot || normalized.startsWith(`${installRoot}\\`);
}

function allowUserInstalledQkrpc() {
  return process.env.AGENT_GUI_USE_INSTALLED_QKRPC === "1";
}

/** Tauri bundle: resources/qkrpc next to resources/app (Node cwd). */
function resolveTauriBundledQkrpcDir(agentGuiRoot) {
  const sibling = join(agentGuiRoot, "..", "qkrpc");
  const exe = join(sibling, QKRPC_EXE);
  return existsSync(exe) ? sibling : null;
}

/** Source directories that ship a full self-contained qkrpc runtime. */
export function listBundledQkrpcSourceDirs(agentGuiRoot) {
  const tauriBundled = resolveTauriBundledQkrpcDir(agentGuiRoot);
  return [
    ...(tauriBundled ? [tauriBundled] : []),
    join(agentGuiRoot, "qkrpc"),
    join(agentGuiRoot, "..", "publish", "cli"),
    ...listConsoleReleaseOutputDirs(agentGuiRoot),
  ];
}

export function resolveBundledQkrpcSourceDir(agentGuiRoot) {
  for (const dir of listBundledQkrpcSourceDirs(agentGuiRoot)) {
    const exe = join(dir, QKRPC_EXE);
    if (existsSync(exe)) return dir;
  }
  return null;
}

function stagedRuntimeDir(agentGuiRoot) {
  return join(agentGuiRoot, ".runtime", "qkrpc");
}

/** @returns {boolean} true when copy succeeded */
function syncStagedRuntimeTree(sourceDir, runtimeDir) {
  try {
    cpSync(sourceDir, runtimeDir, { recursive: true, force: true });
    return true;
  } catch (err) {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (
      code === "EPERM"
      || code === "EBUSY"
      || code === "EACCES"
      || code === "EPIPE"
      || code === "ENOTEMPTY"
    ) {
      return false;
    }
    throw err;
  }
}

function isStagedRuntimeExe(agentGuiRoot, exePath) {
  const runtimeDir = normalize(stagedRuntimeDir(agentGuiRoot)).toLowerCase();
  const normalized = normalize(exePath).toLowerCase();
  return normalized.startsWith(`${runtimeDir}${process.platform === "win32" ? "\\" : "/"}`);
}

/**
 * Copy bundled qkrpc into agent-gui/.runtime/qkrpc so serve does not lock
 * publish/cli or the user install under %LOCALAPPDATA%\\Programs\\qkrpc.
 */
export function ensureStagedQkrpcRuntime(agentGuiRoot) {
  const sourceDir = resolveBundledQkrpcSourceDir(agentGuiRoot);
  if (!sourceDir) return null;

  const runtimeDir = stagedRuntimeDir(agentGuiRoot);
  const stagedExe = join(runtimeDir, QKRPC_EXE);
  const sourceExe = join(sourceDir, QKRPC_EXE);

  reconcileStaleQkrpcServe(agentGuiRoot, { runtimeDir });

  let needsSync = !existsSync(stagedExe);
  if (!needsSync) {
    try {
      needsSync = statSync(sourceExe).mtimeMs > statSync(stagedExe).mtimeMs;
    } catch {
      needsSync = true;
    }
  }

  if (needsSync) {
    mkdirSync(runtimeDir, { recursive: true });
    // Stop staged serve before overlay — qkrpc.exe locks clrjit.dll under .runtime/qkrpc.
    stopQkrpcServeForRuntimeDir(agentGuiRoot, runtimeDir);
    if (!syncStagedRuntimeTree(sourceDir, runtimeDir)) {
      stopQkrpcServeForRuntimeDir(agentGuiRoot, runtimeDir);
      if (!syncStagedRuntimeTree(sourceDir, runtimeDir)) {
        if (existsSync(stagedExe)) {
          console.warn(
            `qkrpc: staged runtime locked; using existing copy at ${runtimeDir}`,
          );
        } else {
          throw new Error(
            `qkrpc: cannot stage runtime (files locked under ${runtimeDir})`,
          );
        }
      }
    }
  }

  if (!existsSync(stagedExe)) return null;
  return { exe: stagedExe, dir: runtimeDir, sourceDir };
}

/**
 * Resolve qkrpc executable for CLI fallback. Never uses the user install unless
 * AGENT_GUI_USE_INSTALLED_QKRPC=1.
 */
export function resolveQkrpcBin(agentGuiRoot) {
  const staged = ensureStagedQkrpcRuntime(agentGuiRoot);

  const configured = process.env.QKRPC_BIN?.trim();
  if (configured && existsSync(configured)) {
    if (isUserInstalledQkrpcPath(configured) && !allowUserInstalledQkrpc()) {
      console.warn(
        `qkrpc: ignoring QKRPC_BIN (user install): ${configured}`,
      );
    } else if (staged && isStagedRuntimeExe(agentGuiRoot, configured)) {
      // start.mjs pins QKRPC_BIN to the staged copy; re-sync from publish/cli before use.
      return staged.exe;
    } else {
      return configured;
    }
  }

  if (staged) return staged.exe;

  const sourceDir = resolveBundledQkrpcSourceDir(agentGuiRoot);
  if (sourceDir) return join(sourceDir, QKRPC_EXE);

  // CLI spawn from Next.js API routes: safe to use user install (serve still uses staged copy).
  const userExe = resolveUserInstalledQkrpcExe() ?? resolveQkrpcFromPath();
  if (userExe) return userExe;

  if (allowUserInstalledQkrpc()) return QKRPC_EXE;
  return null;
}

/**
 * Resolve qkrpc.exe + cwd for `qkrpc serve` (dev auto-recovery and /api/ping).
 * Prefers staged copy from repo/publish; falls back to user install or PATH.
 */
export function resolveServeQkrpcRuntime(agentGuiRoot) {
  const staged = ensureStagedQkrpcRuntime(agentGuiRoot);
  if (staged) {
    return { exe: staged.exe, dir: staged.dir, source: "staged" };
  }

  const configured = process.env.QKRPC_BIN?.trim();
  if (configured && existsSync(configured)) {
    if (!(isUserInstalledQkrpcPath(configured) && !allowUserInstalledQkrpc())) {
      return { exe: configured, dir: dirname(configured), source: "QKRPC_BIN" };
    }
  }

  const sourceDir = resolveBundledQkrpcSourceDir(agentGuiRoot);
  if (sourceDir) {
    return {
      exe: join(sourceDir, QKRPC_EXE),
      dir: sourceDir,
      source: "bundled",
    };
  }

  const userExe = resolveUserInstalledQkrpcExe() ?? resolveQkrpcFromPath();
  if (userExe) {
    return { exe: userExe, dir: dirname(userExe), source: "installed" };
  }

  return null;
}
