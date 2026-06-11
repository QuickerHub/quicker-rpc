import {
  terminalMultiplexer,
  type MultiplexedSessionPhase,
  type MultiplexedSessionSnapshot,
} from "@/lib/terminal-multiplexer";
import {
  warmupTerminalRuntime,
  warmupXtermChunks,
} from "@/lib/terminal-runtime-client";

export type TerminalSessionPhase =
  | "idle"
  | "connecting"
  | "ready"
  | "exited"
  | "error";

export type TerminalSessionSnapshot = {
  phase: TerminalSessionPhase;
  sessionId: string;
  shell?: string;
  cwd?: string;
  exitCode?: number;
  errorMessage?: string;
};

type TerminalSessionListener = (snapshot: TerminalSessionSnapshot) => void;
type TerminalOutputListener = (data: string) => void;

function mapSnapshot(snapshot: MultiplexedSessionSnapshot): TerminalSessionSnapshot {
  const phase: TerminalSessionPhase =
    snapshot.phase === "attached"
      ? "ready"
      : snapshot.phase === "detached"
        ? "idle"
        : snapshot.phase;
  return { ...snapshot, phase };
}

/** Preload runtime + xterm chunks; optionally start a PTY before panel paints. */
export function prefetchTerminalStack(cwd?: string, terminalId?: string): void {
  void warmupTerminalRuntime();
  void warmupXtermChunks();
  if (cwd === undefined || !terminalId) return;
  prefetchTerminalSession(terminalId, cwd);
}

/** Start a PTY session immediately (e.g. on internal tab + click). */
export function prefetchTerminalSession(terminalId: string, cwd: string): void {
  void warmupTerminalRuntime().then((ok) => {
    if (!ok) return;
    void getTerminalSessionClient(terminalId, cwd)
      .ensureConnected(80, 24)
      .catch(() => {});
  });
}

/**
 * Per-tab terminal handle — binds xterm UI to a multiplexed server session.
 * Connection sharing is handled by {@link terminalMultiplexer}.
 */
export class TerminalSessionClient {
  constructor(
    readonly terminalId: string,
    private readonly cwd: string,
  ) {
    terminalMultiplexer.registerSession(terminalId, cwd);
  }

  getSnapshot(): TerminalSessionSnapshot {
    return mapSnapshot(terminalMultiplexer.getSnapshot(this.terminalId));
  }

  subscribeState(listener: TerminalSessionListener): () => void {
    return terminalMultiplexer.subscribeState(this.terminalId, (snapshot) => {
      listener(mapSnapshot(snapshot));
    });
  }

  subscribeOutput(listener: TerminalOutputListener): () => void {
    return terminalMultiplexer.subscribeOutput(this.terminalId, listener);
  }

  async ensureConnected(cols: number, rows: number): Promise<void> {
    await terminalMultiplexer.attach(this.terminalId, this.cwd, cols, rows);
  }

  write(data: string): void {
    terminalMultiplexer.write(this.terminalId, data);
  }

  resize(cols: number, rows: number): void {
    terminalMultiplexer.resize(this.terminalId, cols, rows);
  }

  /** Detach UI; server PTY keeps running (tmux-style). */
  detach(): void {
    terminalMultiplexer.detach(this.terminalId);
  }

  /** Kill server PTY and drop session. */
  dispose(): void {
    terminalMultiplexer.kill(this.terminalId);
  }
}

const clients = new Map<string, TerminalSessionClient>();

export function getTerminalSessionClient(
  terminalId: string,
  cwd: string,
): TerminalSessionClient {
  const existing = clients.get(terminalId);
  if (existing) return existing;
  const created = new TerminalSessionClient(terminalId, cwd);
  clients.set(terminalId, created);
  return created;
}

export function disposeTerminalSessionClient(terminalId: string): void {
  const client = clients.get(terminalId);
  if (!client) return;
  client.dispose();
  clients.delete(terminalId);
}

export function detachTerminalSessionClient(terminalId: string): void {
  const client = clients.get(terminalId);
  if (!client) return;
  client.detach();
  clients.delete(terminalId);
}

export function disposeAllTerminalSessions(): void {
  terminalMultiplexer.killAll();
  clients.clear();
}

export { warmupTerminalRuntime, warmupXtermChunks } from "@/lib/terminal-runtime-client";
export { terminalMultiplexer } from "@/lib/terminal-multiplexer";
