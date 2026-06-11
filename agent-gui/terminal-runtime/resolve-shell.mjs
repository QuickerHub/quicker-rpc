import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, join } from "node:path";

/** node-pty on Windows needs a real PE path — not WindowsApps execution aliases. */
function isSpawnableExecutable(filePath) {
  if (!filePath?.trim() || !existsSync(filePath)) return false;
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) return false;
    const lower = filePath.replace(/\//g, "\\").toLowerCase();
    if (lower.includes("\\windowsapps\\")) return false;
    return true;
  } catch {
    return false;
  }
}

function windowsPowerShellFallback() {
  const systemRoot = process.env.SystemRoot?.trim() || "C:\\Windows";
  return join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

function listWindowsShellCandidates() {
  /** @type {string[]} */
  const candidates = [];
  const push = (value) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    if (!candidates.includes(trimmed)) candidates.push(trimmed);
  };

  push(process.env.AGENT_GUI_POWERSHELL?.trim());

  const programFiles = process.env.ProgramFiles?.trim();
  if (programFiles) {
    push(join(programFiles, "PowerShell", "7", "pwsh.exe"));
    push(join(programFiles, "PowerShell", "7-preview", "pwsh.exe"));
  }

  const programFilesX86 = process.env["ProgramFiles(x86)"]?.trim();
  if (programFilesX86) {
    push(join(programFilesX86, "PowerShell", "7", "pwsh.exe"));
  }

  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    push(join(localAppData, "Programs", "PowerShell", "pwsh.exe"));
  }

  push(windowsPowerShellFallback());

  try {
    const out = execSync("where pwsh", {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split(/\r?\n/)) {
      push(line.trim());
    }
  } catch {
    // ignore
  }

  try {
    const out = execSync("where powershell", {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split(/\r?\n/)) {
      push(line.trim());
    }
  } catch {
    // ignore
  }

  return candidates;
}

/** @type {string | null} */
let cachedShellExecutable = null;

function resolveInteractiveShellExecutableUncached() {
  if (process.platform !== "win32") {
    const shell = process.env.SHELL?.trim();
    if (shell && isSpawnableExecutable(shell)) return shell;
    return "/bin/bash";
  }

  for (const candidate of listWindowsShellCandidates()) {
    if (isSpawnableExecutable(candidate)) return candidate;
  }

  const fallback = windowsPowerShellFallback();
  if (!isSpawnableExecutable(fallback)) {
    throw new Error(
      "No spawnable PowerShell executable found for embedded terminal",
    );
  }
  return fallback;
}

/** Resolve once per process — `where pwsh` is slow on every PTY spawn. */
export function resolveInteractiveShellExecutable() {
  if (cachedShellExecutable) return cachedShellExecutable;
  cachedShellExecutable = resolveInteractiveShellExecutableUncached();
  return cachedShellExecutable;
}

/** Warm shell resolution at runtime startup (before first user terminal). */
export function warmupShellResolution() {
  try {
    resolveInteractiveShellExecutable();
  } catch {
    // first real spawn will surface the error
  }
}

export function shellArgsForExecutable(executable) {
  if (process.platform !== "win32") return [];
  const base = basename(executable).toLowerCase();
  // -NoProfile keeps new tabs near ~1s; profile load can add several seconds on Windows.
  if (base === "pwsh.exe" || base === "pwsh") {
    return ["-NoLogo", "-NoProfile", "-NonInteractive"];
  }
  if (base === "powershell.exe" || base === "powershell") {
    return ["-NoLogo", "-NoProfile", "-NonInteractive"];
  }
  return [];
}
