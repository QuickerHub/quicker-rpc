import {
  chunkIncludesScreenClear,
  mergeTerminalReplay,
} from "@/lib/terminal-ansi-clear";
import {
  invalidateTerminalRuntimeWarmup,
  resolveTerminalWebSocketUrl,
  warmupTerminalRuntime,
  type TerminalServerMessage,
} from "@/lib/terminal-runtime-client";

const TERMINAL_WS_CONNECT_ATTEMPTS = 4;
const TERMINAL_WS_RETRY_BASE_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type MultiplexedSessionPhase =
  | "idle"
  | "connecting"
  | "attached"
  | "detached"
  | "exited"
  | "error";

export type MultiplexedSessionSnapshot = {
  phase: MultiplexedSessionPhase;
  sessionId: string;
  shell?: string;
  cwd?: string;
  exitCode?: number;
  errorMessage?: string;
};

type SessionStateListener = (snapshot: MultiplexedSessionSnapshot) => void;
type SessionOutputListener = (data: string) => void;

type InternalSession = {
  sessionId: string;
  cwd: string;
  phase: MultiplexedSessionPhase;
  shell?: string;
  resolvedCwd?: string;
  exitCode?: number;
  errorMessage?: string;
  outputReplay: string;
  pendingAttach: { cols: number; rows: number } | null;
  serverKnown: boolean;
  attachPromise: Promise<void> | null;
};

/**
 * Browser-side terminal multiplexer (VS Code PtyService / LocalTerminalBackend model).
 *
 * @see https://github.com/microsoft/vscode/blob/main/src/vs/platform/terminal/node/ptyService.ts
 * @see https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/electron-sandbox/localTerminalBackend.ts
 *
 * One IPC/WebSocket channel per window; many PTY sessions keyed by sessionId.
 * Control-plane errors must never poison unrelated session attach state.
 */
class TerminalMultiplexer {
  private ws: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sessions = new Map<string, InternalSession>();
  private readonly stateListeners = new Map<string, Set<SessionStateListener>>();
  private readonly outputListeners = new Map<string, Set<SessionOutputListener>>();
  /** Session awaiting create/attach error correlation only. */
  private pendingErrorSessionId: string | null = null;

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** Open the shared WebSocket channel without creating a PTY session. */
  warmupConnection(): void {
    void this.ensureConnection().catch(() => {});
  }

  registerSession(sessionId: string, cwd: string): void {
    if (this.sessions.has(sessionId)) return;
    this.sessions.set(sessionId, {
      sessionId,
      cwd,
      phase: "idle",
      outputReplay: "",
      pendingAttach: null,
      serverKnown: false,
      attachPromise: null,
    });
  }

  unregisterSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.stateListeners.delete(sessionId);
    this.outputListeners.delete(sessionId);
    if (this.sessions.size === 0 && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  getSnapshot(sessionId: string): MultiplexedSessionSnapshot {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { phase: "idle", sessionId };
    }
    return this.toSnapshot(session);
  }

  subscribeState(sessionId: string, listener: SessionStateListener): () => void {
    let set = this.stateListeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.stateListeners.set(sessionId, set);
    }
    set.add(listener);
    listener(this.getSnapshot(sessionId));
    return () => set!.delete(listener);
  }

  subscribeOutput(sessionId: string, listener: SessionOutputListener): () => void {
    let set = this.outputListeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.outputListeners.set(sessionId, set);
    }
    set.add(listener);
    const session = this.sessions.get(sessionId);
    if (session?.outputReplay) {
      listener(session.outputReplay);
    }
    return () => set!.delete(listener);
  }

  async attach(
    sessionId: string,
    cwd: string,
    cols: number,
    rows: number,
  ): Promise<void> {
    if (!this.sessions.has(sessionId)) {
      this.registerSession(sessionId, cwd);
    }
    const session = this.sessions.get(sessionId)!;
    session.cwd = cwd;
    session.pendingAttach = { cols, rows };

    if (session.phase === "attached" && this.isOpen()) {
      this.post({ type: "resize", sessionId, cols, rows });
      return;
    }

    if (session.attachPromise) {
      await session.attachPromise;
      if (session.phase === "attached") {
        this.post({ type: "resize", sessionId, cols, rows });
      }
      return;
    }

    session.attachPromise = this.attachUntilReady(sessionId);
    try {
      await session.attachPromise;
      if (session.phase === "attached") {
        this.post({ type: "resize", sessionId, cols, rows });
      }
    } finally {
      session.attachPromise = null;
    }
  }

  detach(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.post({ type: "detach", sessionId });
    if (session.phase === "attached" || session.phase === "connecting") {
      this.setPhase(session, "detached");
    }
  }

  kill(sessionId: string): void {
    this.post({ type: "dispose", sessionId });
    this.unregisterSession(sessionId);
  }

  killAll(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      this.kill(sessionId);
    }
  }

  write(sessionId: string, data: string): void {
    if (!data) return;
    this.post({ type: "input", sessionId, data });
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pendingAttach = { cols, rows };
    }
    this.post({ type: "resize", sessionId, cols, rows });
  }

  private attachUntilReady(sessionId: string): Promise<void> {
    return new Promise((resolve) => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        resolve();
        return;
      }

      if (session.phase === "attached") {
        resolve();
        return;
      }

      this.setPhase(session, "connecting");

      const timeout = setTimeout(() => {
        cleanup();
        this.setPhase(session, "error", { errorMessage: "终端连接超时" });
        resolve();
      }, 20_000);

      const unsub = this.subscribeState(sessionId, (snapshot) => {
        if (snapshot.phase === "attached" || snapshot.phase === "error") {
          cleanup();
          resolve();
        }
      });

      const cleanup = () => {
        clearTimeout(timeout);
        unsub();
      };

      void this.requestAttach(session);
    });
  }

  private async requestAttach(session: InternalSession): Promise<void> {
    const dims = session.pendingAttach ?? { cols: 80, rows: 24 };

    try {
      await this.ensureConnection();
      this.pendingErrorSessionId = session.sessionId;
      if (session.serverKnown) {
        await this.postSession({
          type: "attach",
          sessionId: session.sessionId,
          cols: dims.cols,
          rows: dims.rows,
        });
      } else {
        await this.postSession({
          type: "create",
          sessionId: session.sessionId,
          cwd: session.cwd.trim() || undefined,
          cols: dims.cols,
          rows: dims.rows,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setPhase(session, "error", { errorMessage: message });
      this.pendingErrorSessionId = null;
    }
  }

  private async ensureConnection(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }
    this.connectPromise = this.openConnection();
    try {
      await this.connectPromise;
    } catch (err) {
      this.connectPromise = null;
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        detail.includes("WebSocket")
          ? detail
          : `WebSocket connection failed (${detail})`,
      );
    }
  }

  private async openConnection(): Promise<void> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < TERMINAL_WS_CONNECT_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        invalidateTerminalRuntimeWarmup();
        await sleep(TERMINAL_WS_RETRY_BASE_MS * attempt);
      }
      try {
        await this.openConnectionOnce();
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (this.ws) {
          try {
            this.ws.close();
          } catch {
            // ignore
          }
          this.ws = null;
        }
      }
    }
    throw lastError ?? new Error("WebSocket connection failed");
  }

  private openConnectionOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      void warmupTerminalRuntime().then((ok) => {
        if (!ok) {
          reject(new Error("terminal runtime unavailable"));
          return;
        }

        const socket = new WebSocket(resolveTerminalWebSocketUrl());
        this.ws = socket;
        let settled = false;

        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          reject(new Error(message));
        };

        socket.onopen = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        socket.onmessage = (event) => {
          let msg: TerminalServerMessage;
          try {
            msg = JSON.parse(String(event.data)) as TerminalServerMessage;
          } catch {
            return;
          }
          this.dispatch(msg);
        };

        socket.onerror = () => {
          if (socket.readyState !== WebSocket.OPEN) {
            fail("WebSocket connection failed");
          }
        };

        socket.onclose = () => {
          if (!settled) {
            fail("WebSocket connection failed");
            return;
          }
          if (this.ws === socket) {
            this.ws = null;
          }
          this.connectPromise = null;
          this.pendingErrorSessionId = null;
          for (const session of this.sessions.values()) {
            if (session.phase === "attached" || session.phase === "connecting") {
              this.setPhase(session, "detached");
            }
          }
          this.scheduleReconnect();
        };
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.sessions.size === 0 || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureConnection()
        .then(() => this.reattachAll())
        .catch(() => {
          this.scheduleReconnect();
        });
    }, 400);
  }

  private reattachAll(): void {
    for (const session of this.sessions.values()) {
      if (
        session.phase === "detached"
        || session.phase === "attached"
        || session.phase === "connecting"
      ) {
        session.serverKnown = true;
        void this.attach(
          session.sessionId,
          session.cwd,
          session.pendingAttach?.cols ?? 80,
          session.pendingAttach?.rows ?? 24,
        );
      }
    }
  }

  private dispatch(msg: TerminalServerMessage): void {
    if (msg.type === "connected") {
      for (const remote of msg.sessions) {
        const local = this.sessions.get(remote.sessionId);
        if (local) {
          local.serverKnown = true;
          local.shell = remote.shell;
          local.resolvedCwd = remote.cwd;
          if (remote.status === "exited") {
            this.setPhase(local, "exited", { exitCode: remote.exitCode });
          }
        }
      }
      return;
    }

    if (msg.type === "warmed" || msg.type === "sessions") {
      return;
    }

    if (msg.type === "error") {
      this.handleSessionError(msg.message);
      return;
    }

    const sessionId =
      "sessionId" in msg && typeof msg.sessionId === "string"
        ? msg.sessionId
        : "";
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (msg.type === "ready") {
      session.serverKnown = true;
      session.shell = msg.shell;
      session.resolvedCwd = msg.cwd;
      if (msg.replay) {
        session.outputReplay = msg.replay;
        this.emitOutput(sessionId, msg.replay, true);
      }
      this.setPhase(session, msg.status === "exited" ? "exited" : "attached", {
        shell: msg.shell,
        resolvedCwd: msg.cwd,
        exitCode: msg.exitCode,
      });
      this.pendingErrorSessionId = null;
      return;
    }

    if (msg.type === "output") {
      session.outputReplay = mergeTerminalReplay(session.outputReplay, msg.data);
      this.emitOutput(sessionId, msg.data, false);
      return;
    }

    if (msg.type === "exit") {
      this.setPhase(session, "exited", { exitCode: msg.code });
      return;
    }

    if (msg.type === "disposed") {
      this.unregisterSession(sessionId);
      return;
    }

    if (msg.type === "detached") {
      if (session.phase !== "exited" && session.phase !== "error") {
        this.setPhase(session, "detached");
      }
    }
  }

  private handleSessionError(message: string): void {
    const targetId = this.pendingErrorSessionId;
    if (!targetId) return;

    const session = this.sessions.get(targetId);
    if (!session) {
      this.pendingErrorSessionId = null;
      return;
    }

    if (message.includes("Unknown session")) {
      session.serverKnown = false;
      void this.requestAttach(session);
      return;
    }
    if (message.includes("Session already exists")) {
      session.serverKnown = true;
      void this.requestAttach(session);
      return;
    }

    this.setPhase(session, "error", {
      errorMessage: formatTerminalError(message),
    });
    this.pendingErrorSessionId = null;
  }

  /** Fire-and-forget session message (input/resize/detach/dispose). */
  private post(payload: Record<string, unknown>): void {
    void this.ensureConnection()
      .then(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify(payload));
        }
      })
      .catch(() => {});
  }

  /** create/attach — correlates the next error to pendingErrorSessionId. */
  private async postSession(payload: Record<string, unknown>): Promise<void> {
    await this.ensureConnection();
    this.ws!.send(JSON.stringify(payload));
  }

  private setPhase(
    session: InternalSession,
    phase: MultiplexedSessionPhase,
    patch: Partial<InternalSession> = {},
  ): void {
    Object.assign(session, patch, { phase });
    const snapshot = this.toSnapshot(session);
    const listeners = this.stateListeners.get(session.sessionId);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  private toSnapshot(session: InternalSession): MultiplexedSessionSnapshot {
    return {
      phase: session.phase,
      sessionId: session.sessionId,
      shell: session.shell,
      cwd: session.resolvedCwd ?? session.cwd,
      exitCode: session.exitCode,
      errorMessage: session.errorMessage,
    };
  }

  private emitOutput(
    sessionId: string,
    data: string,
    replay: boolean,
  ): void {
    const listeners = this.outputListeners.get(sessionId);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(data);
    }
    if (replay) return;
  }
}

function formatTerminalError(raw: string): string {
  const message = raw.trim();
  if (/^file not found/i.test(message)) {
    return "无法启动 shell（node-pty 找不到可执行的 PowerShell）。请安装 PowerShell 7 或设置 AGENT_GUI_POWERSHELL 为完整路径。";
  }
  if (message.startsWith("cwd not found:")) {
    return `工作目录不存在：${message.slice("cwd not found:".length).trim()}`;
  }
  return message || "终端连接失败";
}

export const terminalMultiplexer = new TerminalMultiplexer();
