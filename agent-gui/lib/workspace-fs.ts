import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, relative, resolve, sep } from "node:path";
import { getRequestCwd } from "@/lib/qkrpc-request-context";
import { resolveDefaultWorkingDirectory } from "@/lib/default-working-directory";

const MAX_READ_CHARS = 200_000;
const MAX_LIST_ENTRIES = 500;

export type WorkspacePathResult =
  | { ok: true; absolute: string; relative: string }
  | { ok: false; error: string };

export function resolveWorkspaceRoot(): string {
  return getRequestCwd()?.trim() || resolveDefaultWorkingDirectory();
}

/** Resolve a relative path under the active working directory; reject traversal escapes. */
export function resolveWorkspacePath(inputPath: string): WorkspacePathResult {
  const root = resolveWorkspaceRoot();
  const trimmed = inputPath.trim();
  if (!trimmed) {
    return { ok: false, error: "path is required." };
  }

  const absolute = resolve(root, trimmed);
  const normalizedRoot = normalize(root + sep);
  const normalizedTarget = normalize(absolute);
  if (
    normalizedTarget !== normalizedRoot.slice(0, -1)
    && !normalizedTarget.startsWith(normalizedRoot)
  ) {
    return { ok: false, error: "path must stay inside the working directory." };
  }

  return {
    ok: true,
    absolute: normalizedTarget,
    relative: relative(root, normalizedTarget).replace(/\\/g, "/"),
  };
}

export async function readWorkspaceFile(
  inputPath: string,
  options?: { offset?: number; limit?: number },
): Promise<
  | { ok: true; path: string; content: string; truncated: boolean; totalChars: number }
  | { ok: false; error: string }
> {
  const resolved = resolveWorkspacePath(inputPath);
  if (!resolved.ok) return resolved;

  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: `file not found: ${resolved.relative}` };
  }

  const fileStat = await stat(resolved.absolute);
  if (!fileStat.isFile()) {
    return { ok: false, error: `not a file: ${resolved.relative}` };
  }

  const raw = await readFile(resolved.absolute, "utf8");
  const offset = Math.max(0, options?.offset ?? 0);
  const limit = options?.limit ?? MAX_READ_CHARS;
  const slice = raw.slice(offset, offset + limit);
  const truncated = offset > 0 || raw.length > offset + limit;

  return {
    ok: true,
    path: resolved.relative,
    content: slice,
    truncated,
    totalChars: raw.length,
  };
}

export async function writeWorkspaceFile(
  inputPath: string,
  content: string,
  options?: { createDirs?: boolean },
): Promise<{ ok: true; path: string; bytesWritten: number } | { ok: false; error: string }> {
  const resolved = resolveWorkspacePath(inputPath);
  if (!resolved.ok) return resolved;

  if (options?.createDirs !== false) {
    await mkdir(dirname(resolved.absolute), { recursive: true });
  }

  await writeFile(resolved.absolute, content, "utf8");
  return {
    ok: true,
    path: resolved.relative,
    bytesWritten: Buffer.byteLength(content, "utf8"),
  };
}

export async function editWorkspaceFile(
  inputPath: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): Promise<
  | { ok: true; path: string; replacements: number }
  | { ok: false; error: string }
> {
  if (!oldString) {
    return { ok: false, error: "oldString must not be empty." };
  }

  const resolved = resolveWorkspacePath(inputPath);
  if (!resolved.ok) return resolved;

  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: `file not found: ${resolved.relative}` };
  }

  const content = await readFile(resolved.absolute, "utf8");
  if (!content.includes(oldString)) {
    return {
      ok: false,
      error: `oldString not found in ${resolved.relative}.`,
    };
  }

  const replacements = replaceAll
    ? content.split(oldString).length - 1
    : content.includes(oldString)
      ? 1
      : 0;
  const next = replaceAll
    ? content.replaceAll(oldString, newString)
    : content.replace(oldString, newString);

  await writeFile(resolved.absolute, next, "utf8");
  return { ok: true, path: resolved.relative, replacements };
}

export type WorkspaceListEntry = {
  path: string;
  kind: "file" | "directory";
  sizeBytes?: number;
};

export async function listWorkspaceFiles(
  inputPath: string,
  options?: { recursive?: boolean; maxEntries?: number },
): Promise<
  | { ok: true; path: string; entries: WorkspaceListEntry[]; truncated: boolean }
  | { ok: false; error: string }
> {
  const resolved = resolveWorkspacePath(inputPath || ".");
  if (!resolved.ok) return resolved;

  if (!existsSync(resolved.absolute)) {
    return { ok: false, error: `path not found: ${resolved.relative}` };
  }

  const rootStat = await stat(resolved.absolute);
  const maxEntries = Math.min(options?.maxEntries ?? 200, MAX_LIST_ENTRIES);
  const entries: WorkspaceListEntry[] = [];
  let truncated = false;

  async function walk(dir: string, prefix: string): Promise<void> {
    if (truncated) return;
    const names = await readdir(dir, { withFileTypes: true });
    names.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of names) {
      if (truncated) break;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        entries.push({ path: rel, kind: "directory" });
        if (entries.length >= maxEntries) {
          truncated = true;
          break;
        }
        if (options?.recursive) {
          await walk(join(dir, entry.name), rel);
        }
        continue;
      }

      if (entry.isFile()) {
        const full = join(dir, entry.name);
        const fileStat = await stat(full);
        entries.push({
          path: rel,
          kind: "file",
          sizeBytes: fileStat.size,
        });
        if (entries.length >= maxEntries) {
          truncated = true;
        }
      }
    }
  }

  if (rootStat.isDirectory()) {
    await walk(resolved.absolute, "");
  } else {
    entries.push({
      path: resolved.relative,
      kind: "file",
      sizeBytes: rootStat.size,
    });
  }

  return {
    ok: true,
    path: resolved.relative,
    entries,
    truncated,
  };
}
