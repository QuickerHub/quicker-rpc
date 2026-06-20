import type { StructuredToolResult } from "@/lib/tool-result";

const cacheByThread = new Map<string, Map<string, StructuredToolResult>>();
const firstQueryByThread = new Map<string, string>();
const orRetryUsedByThread = new Set<string>();

export function normalizeStepRunnerSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function getFirstStepRunnerSearchQuery(threadId: string | undefined): string | undefined {
  if (!threadId) return undefined;
  return firstQueryByThread.get(threadId);
}

export function noteFirstStepRunnerSearchQuery(threadId: string | undefined, query: string): void {
  if (!threadId || firstQueryByThread.has(threadId)) return;
  firstQueryByThread.set(threadId, query.trim());
}

export function consumeStepRunnerOrSearchRetry(threadId: string | undefined): boolean {
  if (!threadId || orRetryUsedByThread.has(threadId)) return false;
  orRetryUsedByThread.add(threadId);
  return true;
}

export function getCachedStepRunnerSearch(
  threadId: string | undefined,
  query: string,
): StructuredToolResult | undefined {
  if (!threadId) return undefined;
  return cacheByThread.get(threadId)?.get(normalizeStepRunnerSearchQuery(query));
}

export function cacheStepRunnerSearch(
  threadId: string | undefined,
  query: string,
  result: StructuredToolResult,
): void {
  if (!threadId || !result.ok) return;
  let threadCache = cacheByThread.get(threadId);
  if (!threadCache) {
    threadCache = new Map();
    cacheByThread.set(threadId, threadCache);
  }
  threadCache.set(normalizeStepRunnerSearchQuery(query), result);
}

/** Test helper — clear in-memory dedup cache. */
export function clearStepRunnerSearchCache(threadId?: string): void {
  if (threadId) {
    cacheByThread.delete(threadId);
    firstQueryByThread.delete(threadId);
    orRetryUsedByThread.delete(threadId);
    return;
  }
  cacheByThread.clear();
  firstQueryByThread.clear();
  orRetryUsedByThread.clear();
}
