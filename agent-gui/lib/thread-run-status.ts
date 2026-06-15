"use client";

const busyThreads = new Set<string>();
const listeners = new Set<() => void>();
let snapshotVersion = 0;

function notify(): void {
  snapshotVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function setThreadRunBusy(threadId: string, busy: boolean): void {
  const had = busyThreads.has(threadId);
  if (busy && !had) {
    busyThreads.add(threadId);
    notify();
    return;
  }
  if (!busy && had) {
    busyThreads.delete(threadId);
    notify();
  }
}

export function isThreadRunBusy(threadId: string): boolean {
  return busyThreads.has(threadId);
}

export function subscribeThreadRunStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getThreadRunStatusVersion(): number {
  return snapshotVersion;
}
