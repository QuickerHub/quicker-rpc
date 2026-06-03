import type { ActionProjectSyncState } from "@/lib/action-project-sync-types";

export type CachedActionProjectSyncStatus = {
  state: ActionProjectSyncState | null;
  message: string;
  error: boolean;
  fetchedAt: number;
};

const CACHE_MAX = 64;
const cache = new Map<string, CachedActionProjectSyncStatus>();

export function actionProjectSyncCacheKey(
  cwd: string,
  actionId: string,
): string {
  return `${cwd.trim()}:${actionId.trim().toLowerCase()}`;
}

export function readActionProjectSyncCache(
  cwd: string,
  actionId: string,
): CachedActionProjectSyncStatus | undefined {
  return cache.get(actionProjectSyncCacheKey(cwd, actionId));
}

export function writeActionProjectSyncCache(
  cwd: string,
  actionId: string,
  entry: Omit<CachedActionProjectSyncStatus, "fetchedAt">,
): void {
  const key = actionProjectSyncCacheKey(cwd, actionId);
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { ...entry, fetchedAt: Date.now() });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export function invalidateActionProjectSyncCache(
  cwd: string,
  actionId: string,
): void {
  cache.delete(actionProjectSyncCacheKey(cwd, actionId));
}
