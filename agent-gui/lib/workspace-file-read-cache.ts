import type { WorkspaceReadResponse } from "@/lib/workspace-explorer-api";
import { workspaceDocumentPathInProject } from "./workspace-document-instances";

export type WorkspaceFileReadCacheEntry = {
  content: string;
  truncated: boolean;
  totalChars?: number;
  fetchedAt: number;
};

const CACHE_MAX_ENTRIES = 64;

const cache = new Map<string, WorkspaceFileReadCacheEntry>();
const inflight = new Map<string, Promise<WorkspaceReadResponse | { ok: false; error: string }>>();

export function normalizeWorkspaceFilePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function workspaceFileReadCacheKey(cwd: string, path: string): string {
  return `${cwd.trim()}\0${normalizeWorkspaceFilePath(path)}`;
}

export function readWorkspaceFileReadCache(
  cwd: string,
  path: string,
): WorkspaceFileReadCacheEntry | undefined {
  return cache.get(workspaceFileReadCacheKey(cwd, path));
}

export function seedWorkspaceFileReadCache(
  cwd: string,
  path: string,
  content: string,
  meta?: Pick<WorkspaceFileReadCacheEntry, "truncated" | "totalChars">,
): void {
  const key = workspaceFileReadCacheKey(cwd, path);
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, {
    content,
    truncated: meta?.truncated ?? false,
    totalChars: meta?.totalChars,
    fetchedAt: Date.now(),
  });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export function invalidateWorkspaceFileReadCache(cwd: string, path: string): void {
  const key = workspaceFileReadCacheKey(cwd, path);
  cache.delete(key);
  inflight.delete(key);
}

/** Delete only this project's cached and pending publication rights, without cancelling its callers. */
export function invalidateWorkspaceProjectFileReadCache(cwd: string, projectPath: string): void {
  const prefix = `${cwd.trim()}\0`;
  for (const key of new Set([...cache.keys(), ...inflight.keys()])) {
    if (key.startsWith(prefix) && workspaceDocumentPathInProject(key.slice(prefix.length), projectPath)) {
      cache.delete(key);
      inflight.delete(key);
    }
  }
}

function toCachedResponse(
  cwd: string,
  path: string,
  entry: WorkspaceFileReadCacheEntry,
): WorkspaceReadResponse {
  return {
    ok: true,
    path: normalizeWorkspaceFilePath(path),
    content: entry.content,
    truncated: entry.truncated,
    totalChars: entry.totalChars,
  };
}

/** Dedupe in-flight reads and reuse recent successful results for the same cwd+path. */
export async function fetchWorkspaceFileCached(
  cwd: string,
  path: string,
  fetcher: () => Promise<WorkspaceReadResponse | { ok: false; error: string }>,
): Promise<WorkspaceReadResponse | { ok: false; error: string }> {
  const key = workspaceFileReadCacheKey(cwd, path);
  const cached = cache.get(key);
  if (cached) {
    return toCachedResponse(cwd, path, cached);
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = fetcher().then((result) => {
      if (inflight.get(key) !== pending) return result;
      inflight.delete(key);
      if (result.ok) {
        seedWorkspaceFileReadCache(cwd, path, result.content, {
          truncated: result.truncated,
          totalChars: result.totalChars,
        });
      }
      return result;
    }, (error) => {
      if (inflight.get(key) === pending) inflight.delete(key);
      throw error;
    });
    inflight.set(key, pending);
  }
  return pending;
}
