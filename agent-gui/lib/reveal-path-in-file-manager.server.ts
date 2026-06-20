import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { resolveQuickerAgentAppDataDirectory } from "@/lib/quicker-agent-paths";

export const CHAT_EXPORTS_SUBDIR = "exports";

/** Allowed roots for reveal-in-file-manager (path traversal guard). */
export type RevealPathScope = "chat-exports";

const execFileAsync = promisify(execFile);

export function resolveRevealScopeRoot(scope: RevealPathScope): string {
  switch (scope) {
    case "chat-exports":
      return join(resolveQuickerAgentAppDataDirectory(), CHAT_EXPORTS_SUBDIR);
    default: {
      const _exhaustive: never = scope;
      return _exhaustive;
    }
  }
}

export function isRevealPathScope(value: unknown): value is RevealPathScope {
  return value === "chat-exports";
}

export function resolvePathWithinRevealScope(
  scope: RevealPathScope,
  filePath: string,
  options?: { mustExist?: boolean },
): string {
  const root = resolve(resolveRevealScopeRoot(scope));
  const resolved = resolve(filePath);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Path is outside the allowed directory");
  }
  if (options?.mustExist !== false && !existsSync(resolved)) {
    throw new Error("Path does not exist");
  }
  return resolved;
}

/** Build the `/select,<path>` argument for explorer.exe on Windows. */
export function windowsExplorerSelectArg(filePath: string): string {
  if (/\s/.test(filePath)) {
    return `/select,"${filePath}"`;
  }
  return `/select,${filePath}`;
}

/**
 * Windows: launch explorer via `cmd start` (exit code 1 from explorer is benign; do not await).
 */
export function revealInWindowsFileManager(resolved: string): void {
  const arg = windowsExplorerSelectArg(resolved);
  const child = spawn(
    "cmd.exe",
    ["/c", "start", "", "explorer.exe", arg],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  child.on("error", () => {
    spawn("explorer.exe", [dirname(resolved)], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  });
  child.unref();
}

export async function revealPathInFileManager(resolvedPath: string): Promise<void> {
  if (!existsSync(resolvedPath)) {
    throw new Error("Path does not exist");
  }
  if (process.platform === "win32") {
    revealInWindowsFileManager(resolvedPath);
    return;
  }
  if (process.platform === "darwin") {
    await execFileAsync("open", ["-R", resolvedPath]);
    return;
  }
  await execFileAsync("xdg-open", [dirname(resolvedPath)]);
}

export async function revealScopedPathInFileManager(
  scope: RevealPathScope,
  filePath: string,
): Promise<{ path: string }> {
  const resolved = resolvePathWithinRevealScope(scope, filePath, {
    mustExist: true,
  });
  await revealPathInFileManager(resolved);
  return { path: resolved };
}
