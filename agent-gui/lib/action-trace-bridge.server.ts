import "server-only";

import type { ActionTraceEvent } from "@/lib/action-trace-format";

export type TraceBridgeMessage =
  | { type: "trace"; event: ActionTraceEvent }
  | { type: "line"; line: string }
  | { type: "done"; data: Record<string, unknown> }
  | { type: "error"; message: string };

type TraceBridgeSession = {
  tabId: string;
  buffer: TraceBridgeMessage[];
  listeners: Set<(message: TraceBridgeMessage) => void>;
  finished: boolean;
};

const sessions = new Map<string, TraceBridgeSession>();

function getOrCreateSession(tabId: string): TraceBridgeSession {
  const existing = sessions.get(tabId);
  if (existing) return existing;
  const session: TraceBridgeSession = {
    tabId,
    buffer: [],
    listeners: new Set(),
    finished: false,
  };
  sessions.set(tabId, session);
  return session;
}

function publish(session: TraceBridgeSession, message: TraceBridgeMessage): void {
  session.buffer.push(message);
  for (const listener of session.listeners) {
    listener(message);
  }
}

export function ensureTraceBridgeSession(tabId: string): void {
  getOrCreateSession(tabId);
}

export function publishTraceBridgeEvent(
  tabId: string,
  event: ActionTraceEvent,
): void {
  publish(getOrCreateSession(tabId), { type: "trace", event });
}

export function publishTraceBridgeLine(tabId: string, line: string): void {
  publish(getOrCreateSession(tabId), { type: "line", line });
}

export function finishTraceBridgeSession(
  tabId: string,
  data: Record<string, unknown>,
): void {
  const session = getOrCreateSession(tabId);
  session.finished = true;
  publish(session, { type: "done", data });
}

export function failTraceBridgeSession(tabId: string, message: string): void {
  const session = getOrCreateSession(tabId);
  session.finished = true;
  publish(session, { type: "error", message });
}

export function subscribeTraceBridge(
  tabId: string,
  listener: (message: TraceBridgeMessage) => void,
): () => void {
  const session = getOrCreateSession(tabId);
  for (const message of session.buffer) {
    listener(message);
  }
  if (session.finished) {
    return () => {};
  }
  session.listeners.add(listener);
  return () => session.listeners.delete(listener);
}

export function clearTraceBridgeSession(tabId: string): void {
  sessions.delete(tabId);
}
