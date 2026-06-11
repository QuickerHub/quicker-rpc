import { createPtySession, resolveTerminalCwd } from "./pty-session.mjs";

const POOL_TARGET = 2;

/**
 * Pre-spawned PTY shells — hand out on create for ~instant second tab (VS Code-style).
 * @typedef {{
 *   shell: string;
 *   cwd: string;
 *   proc: import("node-pty").IPty;
 *   buffer: string;
 * }} PooledPty
 */

export class PtyPool {
  constructor() {
    /** @type {PooledPty[]} */
    this.idle = [];
    this.refillInFlight = 0;
  }

  /**
   * @param {string} agentGuiRoot
   * @param {string | undefined} repoRoot
   * @param {string | undefined} preferredCwd
   */
  scheduleRefill(agentGuiRoot, repoRoot, preferredCwd) {
    const targetCwd = resolveTerminalCwd(preferredCwd, agentGuiRoot);
    while (this.idle.length + this.refillInFlight < POOL_TARGET) {
      this.refillOne(agentGuiRoot, repoRoot, targetCwd);
    }
  }

  /**
   * @param {string} agentGuiRoot
   * @param {string | undefined} repoRoot
   * @param {string} expectedCwd
   * @param {number} cols
   * @param {number} rows
   * @returns {PooledPty | null}
   */
  take(agentGuiRoot, repoRoot, expectedCwd, cols, rows) {
    const normalized = resolveTerminalCwd(expectedCwd, agentGuiRoot);
    const index = this.idle.findIndex((item) => item.cwd === normalized);
    if (index < 0) return null;

    const [item] = this.idle.splice(index, 1);
    try {
      const safeCols = Math.max(20, Math.min(400, Number(cols) || 80));
      const safeRows = Math.max(5, Math.min(200, Number(rows) || 24));
      item.proc.resize(safeCols, safeRows);
    } catch {
      // ignore resize errors on pooled shell
    }

    this.scheduleRefill(agentGuiRoot, repoRoot, normalized);
    return item;
  }

  /**
   * @param {string} agentGuiRoot
   * @param {string | undefined} repoRoot
   * @param {string | undefined} preferredCwd
   */
  warmup(agentGuiRoot, repoRoot, preferredCwd) {
    this.scheduleRefill(agentGuiRoot, repoRoot, preferredCwd);
  }

  /**
   * @param {string} agentGuiRoot
   * @param {string | undefined} repoRoot
   * @param {string} cwd
   */
  refillOne(agentGuiRoot, repoRoot, cwd) {
    this.refillInFlight += 1;
    setImmediate(() => {
      try {
        const created = createPtySession({
          cwd,
          cols: 80,
          rows: 24,
          agentGuiRoot,
          repoRoot,
        });
        this.idle.push({
          shell: created.shell,
          cwd: created.cwd,
          proc: created.proc,
          buffer: "",
        });
        created.proc.onData((chunk) => {
          const entry = this.idle.find((item) => item.proc === created.proc);
          if (!entry) return;
          entry.buffer += chunk;
          if (entry.buffer.length > 32 * 1024) {
            entry.buffer = entry.buffer.slice(-32 * 1024);
          }
        });
      } catch {
        // surfaced on next explicit create
      } finally {
        this.refillInFlight = Math.max(0, this.refillInFlight - 1);
      }
    });
  }
}

/** @type {PtyPool | null} */
let sharedPool = null;

export function getPtyPool() {
  if (!sharedPool) {
    sharedPool = new PtyPool();
  }
  return sharedPool;
}
