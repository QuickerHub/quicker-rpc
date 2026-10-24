import { watch, type FSWatcher } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { buildActionExplorerTree } from "@/lib/action-explorer-server";
import {
  computeExplorerTreeSignature,
  type ActionExplorerTree,
} from "@/lib/action-explorer-tree";
import { buildSubProgramExplorerTree } from "@/lib/subprogram-explorer-server";
import { getActionsRootRelative } from "@/lib/action-project-path-shared";
import { getGlobalSubProgramsRootRelative } from "@/lib/workspace-program-target";
import { runWithQkrpcCwdAsync } from "@/lib/qkrpc-request-context";
import { resolveWorkspacePath, resolveWorkspaceRoot } from "@/lib/workspace-fs";

export type ActionExplorerWatchEvent =
  | {
      ok: true;
      type: "tree";
      tree: ActionExplorerTree;
      subprogramTree: ActionExplorerTree;
    }
  | {
      ok: true;
      type: "program-data";
      /** Workspace-relative data.json paths that changed on disk. */
      paths: string[];
    }
  | { ok: false; type: "error"; error: string };

type WatchSubscriber = {
  send: (event: ActionExplorerWatchEvent) => void;
};

type WatchSession = {
  owner: WatchOwnerState;
  disposed: boolean;
  cwd: string;
  rootKey: string;
  watchers: FSWatcher[];
  debounceTimer: ReturnType<typeof setTimeout> | null;
  rebuildInFlight: Promise<void> | null;
  rebuilding: boolean;
  rebuildCooldownUntil: number;
  lastTreeSignature: string | null;
  lastTree: ActionExplorerTree | null;
  lastSubprogramTree: ActionExplorerTree | null;
  lastTreeBuiltAt: number;
  /** data.json paths collected between debounced rebuilds. */
  pendingProgramDataPaths: Set<string>;
  subscribers: Set<WatchSubscriber>;
  idleTimer: ReturnType<typeof setTimeout> | null;
};

const DEBOUNCE_MS = 250;
const IDLE_DISPOSE_MS = 30_000;
const REBUILD_COOLDOWN_MS = 400;
/** Skip redundant rebuild when a new SSE client connects shortly after the last build. */
const SUBSCRIBE_REBUILD_MAX_AGE_MS = 8_000;

type WatchOwnerState = {
  sessions: Map<string, WatchSession>;
  rebuilds: Set<Promise<void>>;
  closed: boolean;
};

const watchOwnerContext = new AsyncLocalStorage<WatchOwnerState>();
// Next keeps its existing process-lifetime cache; Node services bind their own owner.
const nextWatchOwner: WatchOwnerState = { sessions: new Map(), rebuilds: new Set(), closed: false };

/** One runtime owns its watchers, timers and outstanding tree reads, including idle sessions. */
export function createActionExplorerWatchOwner() {
  const owner: WatchOwnerState = { sessions: new Map(), rebuilds: new Set(), closed: false };
  let disposing: Promise<void> | undefined;
  return {
    run<T>(callback: () => T): T {
      return watchOwnerContext.run(owner, callback);
    },
    dispose(): Promise<void> {
      if (!disposing) {
        owner.closed = true;
        disposing = Promise.resolve().then(async () => {
          for (const session of owner.sessions.values()) disposeSession(session);
          const results = await Promise.allSettled([...owner.rebuilds]);
          const errors = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
          if (errors.length) throw new AggregateError(errors.map((result) => result.reason), "Explorer watch cleanup failed");
        });
      }
      return disposing;
    },
  };
}

function sessionKey(): string {
  return resolveWorkspaceRoot().replace(/\\/g, "/").toLowerCase();
}

function isQuickerWorkspaceRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return (
    normalized === ".quicker/actions"
    || normalized.startsWith(".quicker/actions/")
    || normalized === ".quicker/subprograms"
    || normalized.startsWith(".quicker/subprograms/")
    || normalized === ".quicker"
  );
}

/** Map fs.watch filename (relative to watch root) to workspace-relative data.json path. */
export function resolveProgramDataPathFromWatch(
  watchRootRel: string,
  filename: string | null | Buffer,
): string | null {
  if (filename == null) return null;
  const leaf = (
    typeof filename === "string" ? filename : filename.toString("utf8")
  ).replace(/\\/g, "/");
  if (!leaf.toLowerCase().endsWith("data.json")) return null;
  const root = watchRootRel.replace(/\\/g, "/").replace(/\/+$/, "");
  const combined = leaf.includes("/")
    ? `${root}/${leaf}`
    : `${root}/${leaf}`;
  return combined.replace(/\/+/g, "/");
}

function shouldHandleWatchFilename(filename: string | null | Buffer): boolean {
  if (filename == null) return true;
  const name =
    typeof filename === "string" ? filename : filename.toString("utf8");
  const normalized = name.replace(/\\/g, "/");
  if (!normalized) return true;
  return (
    normalized.includes("actions")
    || normalized.includes("subprograms")
    || normalized.startsWith(".quicker")
    || !normalized.includes("/")
  );
}

function computeCombinedTreeSignature(
  actionTree: ActionExplorerTree,
  subprogramTree: ActionExplorerTree,
): string {
  return `${computeExplorerTreeSignature(actionTree)}\n---\n${computeExplorerTreeSignature(subprogramTree)}`;
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
  if (session.disposed) return;
  session.disposed = true;
  stopWatchers(session);
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }
  session.subscribers.clear();
  session.pendingProgramDataPaths.clear();
  session.owner.sessions.delete(session.rootKey);
}

function scheduleIdleDispose(session: WatchSession): void {
  if (session.disposed || session.owner.closed) return;
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
    if (session.disposed || session.owner.closed) return;
    subscriber.send(event);
  }
}

function takePendingProgramDataPaths(session: WatchSession): string[] {
  if (session.pendingProgramDataPaths.size === 0) return [];
  const paths = [...session.pendingProgramDataPaths];
  session.pendingProgramDataPaths.clear();
  return paths;
}

function notifyProgramDataChanges(
  session: WatchSession,
  paths: string[],
): void {
  if (paths.length === 0) return;
  notifySubscribers(session, {
    ok: true,
    type: "program-data",
    paths,
  });
}

async function rebuildAndNotify(session: WatchSession): Promise<void> {
  if (session.disposed || session.owner.closed) return;
  if (session.rebuildInFlight) {
    await session.rebuildInFlight;
    return;
  }

  const changedProgramDataPaths = takePendingProgramDataPaths(session);

  const pending = runWithQkrpcCwdAsync(session.cwd, async () => {
    session.rebuilding = true;
    try {
      const [actionResult, subprogramResult] = await Promise.all([
        buildActionExplorerTree(),
        buildSubProgramExplorerTree(),
      ]);
      if (session.disposed || session.owner.closed) return;
      if (!actionResult.ok) {
        notifySubscribers(session, {
          ok: false,
          type: "error",
          error: actionResult.error,
        });
        return;
      }
      if (!subprogramResult.ok) {
        notifySubscribers(session, {
          ok: false,
          type: "error",
          error: subprogramResult.error,
        });
        return;
      }
      const signature = computeCombinedTreeSignature(
        actionResult.tree,
        subprogramResult.tree,
      );
      if (session.lastTreeSignature === signature) {
        notifyProgramDataChanges(session, changedProgramDataPaths);
        return;
      }
      session.lastTreeSignature = signature;
      session.lastTree = actionResult.tree;
      session.lastSubprogramTree = subprogramResult.tree;
      session.lastTreeBuiltAt = Date.now();
      notifySubscribers(session, {
        ok: true,
        type: "tree",
        tree: actionResult.tree,
        subprogramTree: subprogramResult.tree,
      });
      notifyProgramDataChanges(session, changedProgramDataPaths);
    } finally {
      session.rebuilding = false;
      session.rebuildCooldownUntil = Date.now() + REBUILD_COOLDOWN_MS;
    }
  }).finally(() => {
    session.owner.rebuilds.delete(pending);
    session.rebuildInFlight = null;
    if (session.pendingProgramDataPaths.size > 0) {
      scheduleRebuild(session);
    }
  });

  session.rebuildInFlight = pending;
  session.owner.rebuilds.add(pending);
  await pending;
}

function scheduleRebuild(session: WatchSession): void {
  if (session.disposed || session.owner.closed) return;
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

  const watchEntries: { absolute: string; rootRel: string }[] = [];
  for (const rootRel of [getActionsRootRelative(), getGlobalSubProgramsRootRelative()]) {
    const resolved = resolveWorkspacePath(rootRel);
    if (!resolved.ok) continue;
    if (existsSync(resolved.absolute)) {
      watchEntries.push({ absolute: resolved.absolute, rootRel });
      continue;
    }
    const parent = dirname(resolved.absolute);
    if (existsSync(parent)) {
      watchEntries.push({ absolute: parent, rootRel });
    }
  }

  const seenAbs = new Set<string>();
  for (const entry of watchEntries) {
    const key = entry.absolute.toLowerCase();
    if (seenAbs.has(key)) continue;
    seenAbs.add(key);
    try {
      const { absolute: target, rootRel } = entry;
      const watcher = watch(
        target,
        { recursive: true },
        (_eventType, filename) => {
          if (session.disposed || session.owner.closed) return;
          if (!shouldHandleWatchFilename(filename)) return;
          const programDataPath = resolveProgramDataPathFromWatch(rootRel, filename);
          if (programDataPath) {
            session.pendingProgramDataPaths.add(programDataPath);
          }
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

function getOrCreateSession(owner: WatchOwnerState, cwd: string): WatchSession {
  const rootKey = sessionKey();
  const existing = owner.sessions.get(rootKey);
  if (existing) {
    if (existing.idleTimer) {
      clearTimeout(existing.idleTimer);
      existing.idleTimer = null;
    }
    return existing;
  }

  const session: WatchSession = {
    owner,
    disposed: false,
    cwd,
    rootKey,
    watchers: [],
    debounceTimer: null,
    rebuildInFlight: null,
    rebuilding: false,
    rebuildCooldownUntil: 0,
    lastTreeSignature: null,
    lastTree: null,
    lastSubprogramTree: null,
    lastTreeBuiltAt: 0,
    pendingProgramDataPaths: new Set(),
    subscribers: new Set(),
    idleTimer: null,
  };
  owner.sessions.set(rootKey, session);
  return session;
}

/** Subscribe to filesystem-driven explorer tree updates for a workspace cwd. */
export function subscribeActionExplorerWatch(
  cwd: string,
  send: (event: ActionExplorerWatchEvent) => void,
): () => void {
  const owner = watchOwnerContext.getStore() ?? nextWatchOwner;
  if (owner.closed) {
    send({ ok: false, type: "error", error: "Explorer watch service is stopped" });
    return () => {};
  }
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
    if (state.disposed || owner.closed) return;
    state.session = getOrCreateSession(owner, trimmed);
    state.session.subscribers.add(subscriber);
    ensureWatchers(state.session);
    // New SSE clients need the latest tree even when rebuild dedupes by signature.
    if (state.session.lastTree && state.session.lastSubprogramTree) {
      subscriber.send({
        ok: true,
        type: "tree",
        tree: state.session.lastTree,
        subprogramTree: state.session.lastSubprogramTree,
      });
    }
    const cacheAge = Date.now() - state.session.lastTreeBuiltAt;
    if (
      state.session.lastTree
      && state.session.lastSubprogramTree
      && cacheAge < SUBSCRIBE_REBUILD_MAX_AGE_MS
    ) {
      return;
    }
    await rebuildAndNotify(state.session);
  });

  return () => {
    if (state.disposed) return;
    state.disposed = true;
    if (!state.session || state.session.disposed) return;
    state.session.subscribers.delete(subscriber);
    if (state.session.subscribers.size === 0) {
      scheduleIdleDispose(state.session);
    }
  };
}

/** Test helper: whether a relative path is under .quicker/actions or subprograms. */
export function isActionExplorerWatchPath(relativePath: string): boolean {
  return isQuickerWorkspaceRelativePath(relativePath);
}
