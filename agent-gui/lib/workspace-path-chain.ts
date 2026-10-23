import { isAbsolute, join, relative, resolve, sep } from "node:path";

export type WorkspacePathResolution =
  | { ok: true; absolute: string; relative: string }
  | { ok: false; error: string };

export type WorkspacePathMetadata = {
  isDirectory: () => boolean;
  isSymbolicLink: () => boolean;
  nlink?: number;
};

export type WorkspacePathFileSystem = {
  lstat: (path: string) => Promise<WorkspacePathMetadata>;
  realpath: (path: string) => Promise<string>;
};

function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

/** Inspect only the named ancestor chain; preserve a selected root alias, never follow one outside it. */
export async function resolveWorkspacePathChain(
  workspaceRoot: string,
  lexical: WorkspacePathResolution,
  fs: WorkspacePathFileSystem,
  abortSignal?: AbortSignal,
): Promise<({ ok: true; root: string; canonicalPaths: string[]; metadata?: WorkspacePathMetadata } & Extract<WorkspacePathResolution, { ok: true }>) | Extract<WorkspacePathResolution, { ok: false }>> {
  if (!lexical.ok) return lexical;
  const root = resolve(workspaceRoot);
  if (!isInside(root, lexical.absolute)) return { ok: false, error: "path must stay inside the working directory." };
  try {
    abortSignal?.throwIfAborted();
    const actualRoot = await fs.realpath(root);
    const rootStat = await fs.lstat(actualRoot);
    if (!rootStat.isDirectory()) return { ok: false, error: "The workspace root is not a directory." };
    let absolute = actualRoot;
    let candidate = root;
    let missing = false;
    let metadata: WorkspacePathMetadata | undefined = rootStat;
    const canonicalPaths: string[] = [];
    const segments = relative(root, lexical.absolute).split(sep).filter(Boolean);
    for (const [index, segment] of segments.entries()) {
      abortSignal?.throwIfAborted();
      candidate = join(candidate, segment);
      absolute = join(absolute, segment);
      if (missing) continue;
      try { metadata = await fs.lstat(candidate); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        missing = true;
        metadata = undefined;
        continue;
      }
      if (index < segments.length - 1 && !metadata.isDirectory() && !metadata.isSymbolicLink()) {
        return { ok: false, error: "A path ancestor is not a directory." };
      }
      absolute = await fs.realpath(candidate);
      if (!isInside(actualRoot, absolute)) return { ok: false, error: "Path ancestors must stay inside the canonical working directory." };
      canonicalPaths.push(absolute);
    }
    if (!missing && segments.length) metadata = await fs.lstat(absolute);
    abortSignal?.throwIfAborted();
    return { ...lexical, absolute, root: actualRoot, canonicalPaths, metadata };
  } catch (error) {
    abortSignal?.throwIfAborted();
    return { ok: false, error: `Cannot verify workspace path: ${error instanceof Error ? error.message : String(error)}` };
  }
}
