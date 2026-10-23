import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { TurnExecutionState } from "@/lib/agent-harness/turn-execution-state";
import type { SourceDirectoryResolution } from "@/lib/action-source-directory";

function pathKey(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

/** Only a confirmed source operation can establish this proof; no sidecar reads are needed. */
export function rememberActionSourceReadDirectory(state: TurnExecutionState | undefined, directory: string): void {
  if (!state || state.closed || !isAbsolute(directory)) return;
  let confirmed = directory;
  try {
    // Freeze the target now; resolving a saved alias later could trust a retargeted link.
    confirmed = realpathSync.native(directory);
  } catch {
    // Unavailable metadata keeps the lexical proof; reads must still pass canonical checks.
  }
  (state.actionSourceDirectories ??= new Set()).add(pathKey(confirmed));
}

function editableSourcePath(state: TurnExecutionState, absolute: string): boolean {
  const target = pathKey(absolute);
  return [...(state.actionSourceDirectories ?? [])].some((directory) => {
    const child = relative(directory, target);
    return child === "program.source.yaml" || child.startsWith(`files${sep}`);
  });
}

export type ActionSourceReadDependencies = {
  resolveDirectory: (directory: string, abortSignal?: AbortSignal) => Promise<SourceDirectoryResolution>;
  lstat: (path: string) => Promise<{ isFile: () => boolean; isSymbolicLink: () => boolean }>;
  realpath: (path: string) => Promise<string>;
};

/** Restrict the legacy post-create/patch Read exception to this turn's proven YAML/resources. */
export async function validateConfirmedActionSourceRead(
  state: TurnExecutionState | undefined,
  lexical: SourceDirectoryResolution,
  dependencies: ActionSourceReadDependencies,
  abortSignal?: AbortSignal,
): Promise<boolean> {
  abortSignal?.throwIfAborted();
  if (!state || state.closed || !state.actionSourceDirectories?.size || !lexical.ok) return false;
  const candidate = pathKey(lexical.absolute);
  if (basename(candidate) !== "program.source.yaml" && !candidate.split(sep).includes("files")) return false;
  try {
    const parent = await dependencies.resolveDirectory(dirname(lexical.absolute), abortSignal);
    abortSignal?.throwIfAborted();
    if (!parent.ok) return false;
    const canonicalCandidate = join(parent.absolute, basename(lexical.absolute));
    if (!editableSourcePath(state, canonicalCandidate)) return false;
    const metadata = await dependencies.lstat(lexical.absolute);
    abortSignal?.throwIfAborted();
    if (!metadata.isFile() || metadata.isSymbolicLink()) return false;
    const canonical = await dependencies.realpath(lexical.absolute);
    abortSignal?.throwIfAborted();
    return !state.closed
      && pathKey(canonical) === pathKey(canonicalCandidate)
      && editableSourcePath(state, canonical);
  } catch (error) {
    abortSignal?.throwIfAborted();
    return false;
  }
}
