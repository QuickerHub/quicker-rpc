import type { StructuredToolResult } from "@/lib/tool-result";

const cacheByThread = new Map<string, Map<string, StructuredToolResult>>();

export function normalizeStepRunnerGetCacheKey(
  key: string,
  controlField?: string,
): string {
  const k = key.trim().toLowerCase();
  const cf = controlField?.trim().toLowerCase() ?? "";
  return cf ? `${k}|${cf}` : k;
}

export function getCachedStepRunnerGet(
  threadId: string | undefined,
  key: string,
  controlField?: string,
): StructuredToolResult | undefined {
  if (!threadId) return undefined;
  return cacheByThread.get(threadId)?.get(
    normalizeStepRunnerGetCacheKey(key, controlField),
  );
}

export function cacheStepRunnerGet(
  threadId: string | undefined,
  key: string,
  controlField: string | undefined,
  result: StructuredToolResult,
): void {
  if (!threadId || !result.ok) return;
  let threadCache = cacheByThread.get(threadId);
  if (!threadCache) {
    threadCache = new Map();
    cacheByThread.set(threadId, threadCache);
  }
  threadCache.set(normalizeStepRunnerGetCacheKey(key, controlField), result);
}

/** Test helper — clear in-memory dedup cache. */
export function clearStepRunnerGetCache(threadId?: string): void {
  if (threadId) {
    cacheByThread.delete(threadId);
    return;
  }
  cacheByThread.clear();
}
