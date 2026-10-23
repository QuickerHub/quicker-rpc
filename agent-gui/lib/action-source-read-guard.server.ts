import { lstat, realpath } from "node:fs/promises";
import { resolveActionSourceDirectory } from "@/lib/action-source-directory.server";
import { rememberActionSourceReadDirectory, validateConfirmedActionSourceRead } from "@/lib/action-source-read-guard";
import { getRequestAbortSignal, getRequestTurnExecutionState } from "@/lib/qkrpc-request-context";
import { resolveWorkspacePath } from "@/lib/workspace-fs";

export function rememberActionSourceDirectory(absoluteDirectory: string): void {
  rememberActionSourceReadDirectory(getRequestTurnExecutionState(), absoluteDirectory);
}

export function canReadConfirmedActionSourcePath(path: string): Promise<boolean> {
  return validateConfirmedActionSourceRead(getRequestTurnExecutionState(), resolveWorkspacePath(path), {
    resolveDirectory: resolveActionSourceDirectory,
    lstat,
    realpath,
  }, getRequestAbortSignal());
}
