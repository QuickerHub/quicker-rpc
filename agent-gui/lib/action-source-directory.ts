import { relative } from "node:path";
import { resolveWorkspacePathChain, type WorkspacePathFileSystem, type WorkspacePathResolution } from "@/lib/workspace-path-chain";

export type SourceDirectoryResolution = WorkspacePathResolution;
export type SourceDirectoryFileSystem = WorkspacePathFileSystem;

function legacyPath(path: string): boolean {
  return /(?:^|[/\\])\.quicker(?:[/\\]|$)/i.test(path);
}

/** Resolve only the named directory chain, never its contents. C# owns cloud/native validation. */
export async function validateActionSourceDirectory(
  workspaceRoot: string,
  lexical: SourceDirectoryResolution,
  fs: SourceDirectoryFileSystem,
  abortSignal?: AbortSignal,
): Promise<SourceDirectoryResolution> {
  if (!lexical.ok) return lexical;
  if (!lexical.relative || legacyPath(lexical.relative)) {
    return { ok: false, error: "Use a source subdirectory inside cwd outside the legacy .quicker/ tree." };
  }
  const checked = await resolveWorkspacePathChain(workspaceRoot, lexical, fs, abortSignal);
  if (!checked.ok) return checked;
  if (legacyPath(checked.root) || checked.canonicalPaths.some((path) => legacyPath(relative(checked.root, path)))) {
    return { ok: false, error: "Source directory ancestors must stay outside the legacy .quicker/ tree." };
  }
  if (checked.metadata && !checked.metadata.isDirectory()) return { ok: false, error: "The source target is not a directory." };
  return { ok: true, absolute: checked.absolute, relative: lexical.relative };
}
