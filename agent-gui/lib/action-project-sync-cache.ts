import type { ActionProjectSyncState } from "@/lib/action-project-sync-types";
import { actionProjectSyncTargetKey, type ActionProjectSyncTarget } from "./action-project-sync-target";

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
  target?: ActionProjectSyncTarget,
): string {
  return JSON.stringify([cwd.trim(), actionId.trim().toLowerCase(), actionProjectSyncTargetKey(target)]);
}

export function readActionProjectSyncCache(
  cwd: string,
  actionId: string,
  target?: ActionProjectSyncTarget,
): CachedActionProjectSyncStatus | undefined {
  return cache.get(actionProjectSyncCacheKey(cwd, actionId, target));
}

export function writeActionProjectSyncCache(
  cwd: string,
  actionId: string,
  entry: Omit<CachedActionProjectSyncStatus, "fetchedAt">,
  target?: ActionProjectSyncTarget,
): void {
  const key = actionProjectSyncCacheKey(cwd, actionId, target);
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
  target?: ActionProjectSyncTarget,
): void {
  cache.delete(actionProjectSyncCacheKey(cwd, actionId, target));
}
