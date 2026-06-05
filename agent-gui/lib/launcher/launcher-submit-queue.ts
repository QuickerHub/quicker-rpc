"use client";

export type PendingLauncherSubmit = {
  threadId: string;
  text: string;
  llmSelection?: string;
};

let pending: PendingLauncherSubmit | null = null;
const listeners = new Set<() => void>();

export function queueLauncherSubmit(
  threadId: string,
  text: string,
  llmSelection?: string,
): void {
  pending = {
    threadId,
    text: text.trim(),
    llmSelection: llmSelection?.trim() || undefined,
  };
  for (const listener of listeners) {
    listener();
  }
}

/** Returns and clears pending submit when threadId matches. */
export function takeLauncherSubmit(threadId: string): PendingLauncherSubmit | null {
  if (!pending || pending.threadId !== threadId) return null;
  const snapshot = pending;
  pending = null;
  return snapshot;
}

export function subscribeLauncherSubmit(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
