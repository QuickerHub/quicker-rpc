"use client";

export type EphemeralLauncherRun = {
  sessionId: string;
  threadId: string;
};

const sessionToThread = new Map<string, string>();
const threadToSession = new Map<string, string>();
const listeners = new Set<() => void>();

function createEphemeralThreadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `launcher-${crypto.randomUUID()}`;
  }
  return `launcher-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeEphemeralLauncherRuns(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEphemeralLauncherRuns(): EphemeralLauncherRun[] {
  return [...sessionToThread.entries()].map(([sessionId, threadId]) => ({
    sessionId,
    threadId,
  }));
}

/** One active launcher run at a time — replaces any prior ephemeral session. */
export function startEphemeralLauncherRun(sessionId: string): string {
  clearEphemeralLauncherRuns();
  const threadId = createEphemeralThreadId();
  sessionToThread.set(sessionId, threadId);
  threadToSession.set(threadId, sessionId);
  notify();
  return threadId;
}

export function getLauncherSessionForThread(
  threadId: string,
): string | undefined {
  return threadToSession.get(threadId);
}

export function clearEphemeralLauncherRuns(): void {
  if (sessionToThread.size === 0) return;
  sessionToThread.clear();
  threadToSession.clear();
  notify();
}
