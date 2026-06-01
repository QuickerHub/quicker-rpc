import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, normalize } from "node:path";

const QKRPC_EXE = process.platform === "win32" ? "qkrpc.exe" : "qkrpc";

/** `%LOCALAPPDATA%\\Programs\\qkrpc\\qkrpc.exe` from build.ps1 -t / setup.exe. */
export function resolveUserInstalledQkrpcExe() {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (!localAppData) return null;
  const exe = join(localAppData, "Programs", "qkrpc", QKRPC_EXE);
  return existsSync(exe) ? exe : null;
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

/** Source directories that ship a full self-contained qkrpc runtime. */
export function listBundledQkrpcSourceDirs(agentGuiRoot) {
  return [
    join(agentGuiRoot, "qkrpc"),
    join(agentGuiRoot, "..", "publish", "cli"),
    join(agentGuiRoot, "..", "QuickerRpc.Console", "bin", "Release", "net8.0", "win-x64"),
    join(agentGuiRoot, "..", "QuickerRpc.Console", "bin", "Release", "net8.0"),
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

  let needsSync = !existsSync(stagedExe);
  if (!needsSync) {
    try {
      needsSync = statSync(sourceExe).mtimeMs > statSync(stagedExe).mtimeMs;
    } catch {
      needsSync = true;
    }
  }

  if (needsSync) {
    mkdirSync(dirname(runtimeDir), { recursive: true });
    rmSync(runtimeDir, { recursive: true, force: true });
    cpSync(sourceDir, runtimeDir, { recursive: true });
  }

  if (!existsSync(stagedExe)) return null;
  return { exe: stagedExe, dir: runtimeDir, sourceDir };
}

/**
 * Resolve qkrpc executable for CLI fallback. Never uses the user install unless
 * AGENT_GUI_USE_INSTALLED_QKRPC=1.
 */
export function resolveQkrpcBin(agentGuiRoot) {
  const configured = process.env.QKRPC_BIN?.trim();
  if (configured && existsSync(configured)) {
    if (isUserInstalledQkrpcPath(configured) && !allowUserInstalledQkrpc()) {
      console.warn(
        `qkrpc: ignoring QKRPC_BIN (user install): ${configured}`,
      );
    } else {
      return configured;
    }
  }

  const staged = ensureStagedQkrpcRuntime(agentGuiRoot);
  if (staged) return staged.exe;

  const sourceDir = resolveBundledQkrpcSourceDir(agentGuiRoot);
  if (sourceDir) return join(sourceDir, QKRPC_EXE);

  // CLI spawn from Next.js API routes: safe to use user install (serve still uses staged copy).
  const userExe = resolveUserInstalledQkrpcExe();
  if (userExe) return userExe;

  if (allowUserInstalledQkrpc()) return QKRPC_EXE;
  return null;
}
