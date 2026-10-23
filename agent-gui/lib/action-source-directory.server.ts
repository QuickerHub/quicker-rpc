import { lstat, realpath } from "node:fs/promises";
import { validateActionSourceDirectory } from "@/lib/action-source-directory";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "@/lib/workspace-fs";

export function resolveActionSourceDirectory(directory: string, abortSignal?: AbortSignal) {
  return validateActionSourceDirectory(resolveWorkspaceRoot(), resolveWorkspacePath(directory), { lstat, realpath }, abortSignal);
}
