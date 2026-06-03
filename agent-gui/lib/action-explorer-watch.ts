import { watch, type FSWatcher } from "node:fs";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { buildActionExplorerTree } from "@/lib/action-explorer-server";
import type { ActionExplorerTree } from "@/lib/action-explorer-tree";
import { getActionsRootRelative } from "@/lib/action-project-path";
import { runWithQkrpcCwdAsync } from "@/lib/qkrpc-request-context";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "@/lib/workspace-fs";

export type ActionExplorerWatchEvent =
  | { ok: true; type: "tree"; tree: ActionExplorerTree }
  | { ok: false; type: "error"; error: string };

type WatchSubscriber = {
  send: (event: ActionExplorerWatchEvent) => void;
};

type WatchSession = {
  cwd: string;
  rootKey: string;
  watchers: FSWatcher[];
  debounceTimer: ReturnType<typeof setTimeout> | null;
  rebuildInFlight: Promise<void> | null;
  rebuilding: boolean;
  rebuildCooldownUntil: number;
  lastTreeJson: string | null;
  subscribers: Set<WatchSubscriber>;
  idleTimer: ReturnType<typeof setTimeout> | null;
};

const DEBOUNCE_MS = 250;
const IDLE_DISPOSE_MS = 30_000;
const REBUILD_COOLDOWN_MS = 400;

const sessions = new Map<string, WatchSession>();

function sessionKey(cwd: string): string {
  return resolveWorkspaceRoot().replace(/\\/g, "/").toLowerCase();
}

function isActionsRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return (
    normalized === ".quicker/actions"
    || normalized.startsWith(".quicker/actions/")
    || normalized === ".quicker"
  );
}

function shouldHandleWatchFilename(filename: string | null | Buffer): boolean {
  if (filename == null) return true;
  const name =
    typeof filename === "string" ? filename : filename.toString("utf8");
  const normalized = name.replace(/\\/g, "/");
  if (!normalized) return true;
  return (
    normalized.includes("actions")
    || normalized.startsWith(".quicker")
    || !normalized.includes("/")
  );
}

function stopWatchers(session: WatchSession): void {
  for (const watcher of session.watchers) {
    watcher.close();
  }
  session.watchers = [];
  if (session.debounceTimer) {
    clearTimeout(session.debounceTimer);
    session.debounceTimer = null;
  }
}

function disposeSession(session: WatchSession): void {
  stopWatchers(session);
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }
  sessions.delete(session.rootKey);
}

function scheduleIdleDispose(session: WatchSession): void {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    if (session.subscribers.size === 0) {
      disposeSession(session);
    }
  }, IDLE_DISPOSE_MS);
}

function notifySubscribers(
  session: WatchSession,
  event: ActionExplorerWatchEvent,
): void {
  for (const subscriber of session.subscribers) {
    subscriber.send(event);
  }
}

async function rebuildAndNotify(session: WatchSession): Promise<void> {
  if (session.rebuildInFlight) {
    await session.rebuildInFlight;
    return;
  }

  session.rebuildInFlight = runWithQkrpcCwdAsync(session.cwd, async () => {
    session.rebuilding = true;
    try {
      const result = await buildActionExplorerTree();
      if (!result.ok) {
        notifySubscribers(session, {
          ok: false,
          type: "error",
          error: result.error,
        });
        return;
      }
      const treeJson = JSON.stringify(result.tree);
      if (session.lastTreeJson === treeJson) {
        return;
      }
      session.lastTreeJson = treeJson;
      notifySubscribers(session, {
        ok: true,
        type: "tree",
        tree: result.tree,
      });
    } finally {
      session.rebuilding = false;
      session.rebuildCooldownUntil = Date.now() + REBUILD_COOLDOWN_MS;
    }
  }).finally(() => {
    session.rebuildInFlight = null;
  });

  await session.rebuildInFlight;
}

function scheduleRebuild(session: WatchSession): void {
  if (session.rebuilding) return;
  if (Date.now() < session.rebuildCooldownUntil) return;
  if (session.debounceTimer) clearTimeout(session.debounceTimer);
  session.debounceTimer = setTimeout(() => {
    session.debounceTimer = null;
    void rebuildAndNotify(session);
  }, DEBOUNCE_MS);
}

function ensureWatchers(session: WatchSession): void {
  if (session.watchers.length > 0) return;

  const actionsRoot = getActionsRootRelative();
  const resolved = resolveWorkspacePath(actionsRoot);
  if (!resolved.ok) return;

  const watchTargets: string[] = [];
  if (existsSync(resolved.absolute)) {
    watchTargets.push(resolved.absolute);
  } else {
    const parent = dirname(resolved.absolute);
    if (existsSync(parent)) watchTargets.push(parent);
  }

  for (const target of watchTargets) {
    try {
      const watcher = watch(
        target,
        { recursive: true },
        (_eventType, filename) => {
          if (!shouldHandleWatchFilename(filename)) return;
          if (session.rebuilding) return;
          if (Date.now() < session.rebuildCooldownUntil) return;
          scheduleRebuild(session);
        },
      );
      watcher.on("error", () => {
        stopWatchers(session);
      });
      session.watchers.push(watcher);
    } catch {
      /* fs.watch may fail on some paths; polling fallback is manual refresh */
    }
  }
}

function getOrCreateSession(cwd: string): WatchSession {
  const rootKey = sessionKey(cwd);
  const existing = sessions.get(rootKey);
  if (existing) {
    if (existing.idleTimer) {
      clearTimeout(existing.idleTimer);
      existing.idleTimer = null;
    }
    return existing;
  }

  const session: WatchSession = {
    cwd,
    rootKey,
    watchers: [],
    debounceTimer: null,
    rebuildInFlight: null,
    rebuilding: false,
    rebuildCooldownUntil: 0,
    lastTreeJson: null,
    subscribers: new Set(),
    idleTimer: null,
  };
  sessions.set(rootKey, session);
  return session;
}

/** Subscribe to filesystem-driven explorer tree updates for a workspace cwd. */
export function subscribeActionExplorerWatch(
  cwd: string,
  send: (event: ActionExplorerWatchEvent) => void,
): () => void {
  const trimmed = cwd.trim();
  if (!trimmed) {
    send({ ok: false, type: "error", error: "未设置工作目录" });
    return () => {};
  }

  const subscriber: WatchSubscriber = {
    send,
  };
  const state: {
    disposed: boolean;
    session: WatchSession | null;
  } = { disposed: false, session: null };

  void runWithQkrpcCwdAsync(trimmed, async () => {
    if (state.disposed) return;
    state.session = getOrCreateSession(trimmed);
    state.session.subscribers.add(subscriber);
    ensureWatchers(state.session);
    await rebuildAndNotify(state.session);
  });

  return () => {
    state.disposed = true;
    if (!state.session) return;
    state.session.subscribers.delete(subscriber);
    if (state.session.subscribers.size === 0) {
      scheduleIdleDispose(state.session);
    }
  };
}

/** Test helper: whether a relative path is under .quicker/actions. */
export function isActionExplorerWatchPath(relativePath: string): boolean {
  return isActionsRelativePath(relativePath);
}
