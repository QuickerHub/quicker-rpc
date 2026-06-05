import type { ShellRunResult } from "@/lib/shell-types";

export type ShellSessionStatus = "running" | "success" | "error";

export type ShellSessionSnapshot = {
  id: string;
  commandLine: string;
  cwd: string;
  shell: string;
  status: ShellSessionStatus;
  stdout: string;
  stderr: string;
  exitCode?: number;
  durationMs?: number;
  timedOut?: boolean;
  blocked?: boolean;
  blockReason?: string;
  truncated?: boolean;
  startedAt: number;
  endedAt?: number;
};

type ShellSessionListener = (snapshot: ShellSessionSnapshot) => void;

const sessions = new Map<string, ShellSessionSnapshot>();
const listeners = new Map<string, Set<ShellSessionListener>>();
const pendingEmits = new Map<string, ReturnType<typeof setTimeout>>();

const MAX_SESSIONS = 48;
const SESSION_TTL_MS = 30 * 60_000;
/** Throttle live stdout/stderr push notifications while a session is running. */
const LIVE_EMIT_THROTTLE_MS = 1_000;

function pruneSessions(): void {
  if (sessions.size <= MAX_SESSIONS) return;
  const sorted = [...sessions.values()].sort(
    (a, b) => (a.endedAt ?? a.startedAt) - (b.endedAt ?? b.startedAt),
  );
  const removeCount = sessions.size - MAX_SESSIONS;
  for (let i = 0; i < removeCount; i++) {
    const id = sorted[i]?.id;
    if (id) sessions.delete(id);
  }
}

function cancelScheduledEmit(id: string): void {
  const timer = pendingEmits.get(id);
  if (!timer) return;
  clearTimeout(timer);
  pendingEmits.delete(id);
}

function notifyListeners(session: ShellSessionSnapshot): void {
  const subs = listeners.get(session.id);
  if (!subs) return;
  for (const listener of subs) {
    listener(session);
  }
}

function storeSession(session: ShellSessionSnapshot): void {
  sessions.set(session.id, session);
}

function emitNow(session: ShellSessionSnapshot): void {
  storeSession(session);
  cancelScheduledEmit(session.id);
  notifyListeners(session);
}

function scheduleLiveEmit(id: string): void {
  if (pendingEmits.has(id)) return;
  pendingEmits.set(
    id,
    setTimeout(() => {
      pendingEmits.delete(id);
      const session = sessions.get(id);
      if (session && session.status === "running") {
        notifyListeners(session);
      }
    }, LIVE_EMIT_THROTTLE_MS),
  );
}

export function beginShellSession(params: {
  id: string;
  commandLine: string;
  cwd: string;
  shell: string;
}): ShellSessionSnapshot {
  const session: ShellSessionSnapshot = {
    id: params.id,
    commandLine: params.commandLine,
    cwd: params.cwd,
    shell: params.shell,
    status: "running",
    stdout: "",
    stderr: "",
    startedAt: Date.now(),
  };
  emitNow(session);
  pruneSessions();
  return session;
}

export function appendShellSessionOutput(
  id: string,
  stream: "stdout" | "stderr",
  chunk: string,
): ShellSessionSnapshot | null {
  const current = sessions.get(id);
  if (!current || current.status !== "running") return current ?? null;
  const next: ShellSessionSnapshot = {
    ...current,
    stdout: stream === "stdout" ? current.stdout + chunk : current.stdout,
    stderr: stream === "stderr" ? current.stderr + chunk : current.stderr,
  };
  storeSession(next);
  scheduleLiveEmit(id);
  return next;
}

export function finishShellSession(
  id: string,
  result: ShellRunResult,
): ShellSessionSnapshot | null {
  const current = sessions.get(id);
  if (!current) return null;
  const next: ShellSessionSnapshot = {
    ...current,
    status: result.ok ? "success" : "error",
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    blocked: result.blocked,
    blockReason: result.blockReason,
    truncated: result.truncated,
    endedAt: Date.now(),
  };
  emitNow(next);
  return next;
}

export function getShellSession(id: string): ShellSessionSnapshot | null {
  const session = sessions.get(id);
  if (!session) return null;
  if (
    session.endedAt
    && Date.now() - session.endedAt > SESSION_TTL_MS
  ) {
    sessions.delete(id);
    return null;
  }
  return session;
}

export function subscribeShellSession(
  id: string,
  listener: ShellSessionListener,
): () => void {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(listener);
  const existing = getShellSession(id);
  if (existing) listener(existing);
  return () => {
    const bucket = listeners.get(id);
    if (!bucket) return;
    bucket.delete(listener);
    if (bucket.size === 0) listeners.delete(id);
  };
}
