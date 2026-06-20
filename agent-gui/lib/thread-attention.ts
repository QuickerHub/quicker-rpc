"use client";

const attentionThreads = new Set<string>();
const listeners = new Set<() => void>();
let snapshotVersion = 0;

function notify(): void {
  snapshotVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function markThreadNeedsAttention(threadId: string): void {
  if (attentionThreads.has(threadId)) return;
  attentionThreads.add(threadId);
  notify();
}

export function clearThreadNeedsAttention(threadId: string): void {
  if (!attentionThreads.delete(threadId)) return;
  notify();
}

export function isThreadNeedsAttention(threadId: string): boolean {
  return attentionThreads.has(threadId);
}

export function subscribeThreadAttention(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getThreadAttentionVersion(): number {
  return snapshotVersion;
}
