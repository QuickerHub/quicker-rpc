import type { ChatThread } from "@/lib/chat-store";

const PINNED_THREADS_STORAGE_KEY = "agent-gui-sidebar-pinned-threads";

export function readPinnedThreadIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PINNED_THREADS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function writePinnedThreadIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PINNED_THREADS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota */
  }
}

export function pinThreadId(ids: string[], threadId: string): string[] {
  if (ids.includes(threadId)) return ids;
  return [threadId, ...ids];
}

export function unpinThreadId(ids: string[], threadId: string): string[] {
  return ids.filter((id) => id !== threadId);
}

export function resolvePinnedThreads(
  threads: ChatThread[],
  pinnedIds: string[],
): ChatThread[] {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const resolved: ChatThread[] = [];
  for (const id of pinnedIds) {
    const thread = byId.get(id);
    if (thread) resolved.push(thread);
  }
  return resolved;
}
