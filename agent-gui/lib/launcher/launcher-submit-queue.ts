"use client";

type PendingLauncherSubmit = {
  threadId: string;
  text: string;
};

let pending: PendingLauncherSubmit | null = null;
const listeners = new Set<() => void>();

export function queueLauncherSubmit(threadId: string, text: string): void {
  pending = { threadId, text: text.trim() };
  for (const listener of listeners) {
    listener();
  }
}

/** Returns and clears pending text when threadId matches. */
export function takeLauncherSubmit(threadId: string): string | null {
  if (!pending || pending.threadId !== threadId) return null;
  const text = pending.text;
  pending = null;
  return text;
}

export function subscribeLauncherSubmit(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
