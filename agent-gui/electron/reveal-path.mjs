import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { quickerAgentAppDataDir } from "./quicker-agent-paths.mjs";

const CHAT_EXPORTS_SUBDIR = "exports";

const REVEAL_SCOPE_ROOTS = {
  "chat-exports": () => join(quickerAgentAppDataDir(), CHAT_EXPORTS_SUBDIR),
};

export function isRevealPathScope(value) {
  return value === "chat-exports";
}

export function resolvePathWithinRevealScope(scope, filePath, options = {}) {
  const rootResolver = REVEAL_SCOPE_ROOTS[scope];
  if (!rootResolver) {
    throw new Error("Invalid reveal scope");
  }
  const root = resolve(rootResolver());
  const resolved = resolve(String(filePath ?? "").trim());
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error("Path is outside the allowed directory");
  }
  if (options.mustExist !== false && !existsSync(resolved)) {
    throw new Error("Path does not exist");
  }
  return resolved;
}

/** Build the `/select,<path>` argument for explorer.exe on Windows. */
export function windowsExplorerSelectArg(filePath) {
  if (/\s/.test(filePath)) {
    return `/select,"${filePath}"`;
  }
  return `/select,${filePath}`;
}

/**
 * Windows: launch explorer via `cmd start` (more reliable than bare spawn or shell.showItemInFolder).
 */
export function revealInWindowsFileManager(resolved) {
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
