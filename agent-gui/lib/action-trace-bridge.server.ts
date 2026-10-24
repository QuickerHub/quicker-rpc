import "server-only";
import type { ActionTraceEvent } from "./action-trace-format";
import { sameTraceRunOwner, type TraceRunOwner } from "./action-trace-owner";
import { createTraceEventDedupe } from "./action-trace-event-dedupe";
export type TraceBridgeMessage = {
  type: "trace";
  event: ActionTraceEvent;
} | {
  type: "line";
  line: string;
} | {
  type: "done";
  data: Record<string, unknown>;
};
type Session = {
  owner: TraceRunOwner;
  buffer: TraceBridgeMessage[];
  bytes: number;
  listeners: Set<(event: TraceBridgeMessage) => void>;
  terminalAt?: number;
  terminal?: Extract<TraceBridgeMessage, {
    type: "done";
  }>;
  dedupe: ReturnType<typeof createTraceEventDedupe>;
};
export function traceTerminalSummary(data: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  let truncated = false;
  for (const key of ["ok", "error", "errorCode", "retryable", "eventCount", "durationMs", "message", "errorMessage", "returnResult"]) {
    const value = data[key];
    if (typeof value === "string") {
      summary[key] = value.slice(0, 16384);
      if (value.length > 16384)
        truncated = true;
    }
    else if (typeof value === "number" || typeof value === "boolean")
      summary[key] = value;
  }
  if (truncated) {
    summary.outputTruncated = true;
    summary.message = `${String(summary.message ?? "")} [trace display truncated; inspect the tool result or trace artifact for full output]`.trim();
  }
  return summary;
}
/** One session per execution, not per action. Retention never owns native execution. */
export function createTraceBridgeRegistry(now = Date.now) {
  const sessions = new Map<string, Session>();
  const prune = () => {
    const terminal = [...sessions.values()].filter((s) => s.terminalAt !== undefined).sort((a, b) => a.terminalAt! - b.terminalAt!);
    for (const [index, session] of terminal.entries()) {
      if (session.listeners.size === 0 && (now() - session.terminalAt! >= 300000 || index < terminal.length - 64))
        sessions.delete(session.owner.runId);
    }
  };
  const find = (owner: TraceRunOwner) => {
    prune();
    const session = sessions.get(owner.runId);
    return session && sameTraceRunOwner(session.owner, owner) ? session : undefined;
  };
  const publish = (session: Session, event: TraceBridgeMessage) => {
    if (event.type === "done")
      session.terminal = event;
    else {
      session.buffer.push(event);
      session.bytes += JSON.stringify(event).length;
      while (session.buffer.length > 2048 || session.bytes > 2000000)
        session.bytes -= JSON.stringify(session.buffer.shift()).length;
    }
    for (const listener of [...session.listeners]) {
      try {
        listener(event);
      }
      catch {
        session.listeners.delete(listener);
      }
    }
  };
  return {
    start(owner: TraceRunOwner) {
      prune();
      if (sessions.has(owner.runId))
        throw new Error("Trace run identity is already registered.");
      sessions.set(owner.runId, { owner, buffer: [], bytes: 0, listeners: new Set(), dedupe: createTraceEventDedupe() });
    },
    has(owner: TraceRunOwner) { return Boolean(find(owner)); },
    event(owner: TraceRunOwner, event: ActionTraceEvent) {
      const session = find(owner);
      if (!session || session.terminalAt !== undefined)
        return false;
      if (!session.dedupe.accept(event)) return false;
      publish(session, { type: "trace", event });
      return true;
    },
    line(owner: TraceRunOwner, line: string) {
      const session = find(owner);
      if (!session || session.terminalAt !== undefined)
        return;
      publish(session, { type: "line", line });
    },
    finish(owner: TraceRunOwner, data: Record<string, unknown>) {
      const session = find(owner);
      if (!session || session.terminalAt !== undefined)
        return false;
      const summary = traceTerminalSummary(data);
      session.terminalAt = now();
      session.dedupe.clear();
      publish(session, { type: "done", data: { ...summary, traceOwner: owner } });
      session.listeners.clear();
      prune();
      return true;
    },
    subscribe(owner: TraceRunOwner, listener: (event: TraceBridgeMessage) => void) {
      const session = find(owner);
      if (!session)
        return undefined;
      for (const event of session.buffer)
        listener(event);
      if (session.terminal)
        listener(session.terminal);
      if (session.terminalAt === undefined)
        session.listeners.add(listener);
      return () => { session.listeners.delete(listener); prune(); };
    },
    size() { prune(); return sessions.size; },
  };
}
export const traceBridge = createTraceBridgeRegistry();
