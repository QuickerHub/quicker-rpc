import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPtySession, resolveTerminalCwd } from "./pty-session.mjs";
import { getPtyPool } from "./pty-pool.mjs";

const runtimeRoot = dirname(fileURLToPath(import.meta.url));
const agentGuiRoot = dirname(runtimeRoot);

const OUTPUT_BUFFER_MAX_CHARS = 256 * 1024;
const MAX_SESSIONS = 24;

/**
 * @typedef {{
 *   id: string;
 *   shell: string;
 *   cwd: string;
 *   proc: import("node-pty").IPty;
 *   buffer: string;
 *   subscribers: Set<import("ws").WebSocket>;
 *   status: "running" | "exited";
 *   exitCode?: number;
 * }} ManagedTerminalSession
 */

export class TerminalSessionManager {
  constructor() {
    /** @type {Map<string, ManagedTerminalSession>} */
    this.sessions = new Map();
    this.repoRoot = process.env.QUICKER_RPC_REPO_ROOT?.trim() || undefined;
  }

  /** Pre-spawn idle shells for fast tab + (same cwd). */
  warmupPool(cwd) {
    getPtyPool().warmup(agentGuiRoot, this.repoRoot, cwd);
  }

  get sessionCount() {
    return this.sessions.size;
  }

  listSessions() {
    return [...this.sessions.values()].map((session) => ({
      sessionId: session.id,
      shell: session.shell,
      cwd: session.cwd,
      status: session.status,
      exitCode: session.exitCode,
    }));
  }

  /** @param {import("ws").WebSocket} ws @param {(payload: unknown) => void} send */
  detachSocket(ws, send) {
    for (const session of this.sessions.values()) {
      if (!session.subscribers.has(ws)) continue;
      session.subscribers.delete(ws);
    }
  }

  /**
   * Detach one UI client from a session; PTY keeps running (tmux-style).
   * @param {import("ws").WebSocket} ws
   * @param {string} sessionId
   */
  detachSocketFromSession(ws, sessionId) {
    const id = sessionId.trim();
    const session = this.sessions.get(id);
    if (!session) return false;
    session.subscribers.delete(ws);
    return true;
  }

  /**
   * @param {import("ws").WebSocket} ws
   * @param {(payload: unknown) => void} send
   * @param {{ sessionId?: string; cwd?: string; cols?: number; rows?: number }} options
   */
  createSession(ws, send, options = {}) {
    this.pruneIfNeeded();

    const requestedId = String(options.sessionId ?? "").trim();
    const id = requestedId || `ts-${randomBytes(6).toString("hex")}`;
    if (this.sessions.has(id)) {
      // Page refresh / new WS while PTY is still alive — attach instead of failing.
      return this.attachSocket(ws, send, id, {
        cols: options.cols,
        rows: options.rows,
      });
    }

    const pool = getPtyPool();
    const pooled = pool.take(
      agentGuiRoot,
      this.repoRoot,
      options.cwd,
      options.cols,
      options.rows,
    );

    /** @type {ManagedTerminalSession} */
    let session;
    try {
      if (pooled) {
        session = {
          id,
          shell: pooled.shell,
          cwd: pooled.cwd,
          proc: pooled.proc,
          buffer: pooled.buffer,
          subscribers: new Set(),
          status: "running",
        };
      } else {
        const created = createPtySession({
          cwd: options.cwd,
          cols: options.cols,
          rows: options.rows,
          agentGuiRoot,
          repoRoot: this.repoRoot,
        });
        session = {
          id,
          shell: created.shell,
          cwd: created.cwd,
          proc: created.proc,
          buffer: "",
          subscribers: new Set(),
          status: "running",
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      send({ type: "error", message });
      return null;
    }

    session.proc.onData((data) => {
      this.appendOutput(session, data);
    });
    session.proc.onExit(({ exitCode }) => {
      session.status = "exited";
      session.exitCode = exitCode ?? 0;
      this.broadcast(session, {
        type: "exit",
        sessionId: session.id,
        code: session.exitCode,
      });
    });

    this.sessions.set(id, session);
    pool.scheduleRefill(
      agentGuiRoot,
      this.repoRoot,
      resolveTerminalCwd(options.cwd, agentGuiRoot),
    );
    this.attachSocket(ws, send, id, {
      cols: options.cols,
      rows: options.rows,
    });
    return session;
  }

  /**
   * @param {import("ws").WebSocket} ws
   * @param {(payload: unknown) => void} send
   * @param {string} sessionId
   * @param {{ cols?: number; rows?: number }} [options]
   */
  attachSocket(ws, send, sessionId, options = {}) {
    const id = sessionId.trim();
    const session = this.sessions.get(id);
    if (!session) {
      send({ type: "error", message: `Unknown session: ${id}` });
      return null;
    }

    session.subscribers.add(ws);
    if (options.cols && options.rows) {
      this.resizeSession(id, options.cols, options.rows);
    }

    send({
      type: "ready",
      sessionId: session.id,
      shell: session.shell,
      cwd: session.cwd,
      status: session.status,
      exitCode: session.exitCode,
      replay: session.buffer || undefined,
    });
    return session;
  }

  /** @param {string} sessionId @param {string} data */
  writeInput(sessionId, data) {
    const session = this.sessions.get(sessionId.trim());
    if (!session || session.status !== "running") return false;
    if (data) session.proc.write(data);
    return true;
  }

  resizeSession(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId.trim());
    if (!session || session.status !== "running") return false;
    const safeCols = Math.max(20, Math.min(400, Number(cols) || 80));
    const safeRows = Math.max(5, Math.min(200, Number(rows) || 24));
    try {
      session.proc.resize(safeCols, safeRows);
      return true;
    } catch {
      return false;
    }
  }

  disposeSession(sessionId) {
    const id = sessionId.trim();
    const session = this.sessions.get(id);
    if (!session) return false;
    // Detach only — WebSocket may be shared across multiple terminal sessions.
    session.subscribers.clear();
    try {
      session.proc.kill();
    } catch {
      // ignore
    }
    this.sessions.delete(id);
    return true;
  }

  shutdown() {
    for (const id of [...this.sessions.keys()]) {
      this.disposeSession(id);
    }
  }

  pruneIfNeeded() {
    if (this.sessions.size < MAX_SESSIONS) return;
    const exited = [...this.sessions.entries()].filter(
      ([, session]) => session.status === "exited" && session.subscribers.size === 0,
    );
    for (const [id] of exited.slice(0, 4)) {
      this.disposeSession(id);
    }
  }

  /** @param {ManagedTerminalSession} session @param {string} data */
  appendOutput(session, data) {
    if (!data) return;
    session.buffer += data;
    if (session.buffer.length > OUTPUT_BUFFER_MAX_CHARS) {
      session.buffer = session.buffer.slice(-OUTPUT_BUFFER_MAX_CHARS);
    }
    this.broadcast(session, {
      type: "output",
      sessionId: session.id,
      data,
    });
  }

  /** @param {ManagedTerminalSession} session @param {unknown} payload */
  broadcast(session, payload) {
    for (const ws of session.subscribers) {
      if (ws.readyState !== ws.OPEN) {
        session.subscribers.delete(ws);
        continue;
      }
      try {
        ws.send(JSON.stringify(payload));
      } catch {
        session.subscribers.delete(ws);
      }
    }
  }
}
