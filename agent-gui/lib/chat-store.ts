import type { AgentUIMessage } from "@/lib/chat-types";
import {
  fetchThreadMessagesFromApi,
  flushPendingChatStoreApiSave,
  flushPendingChatStoreApiSaveAsync,
  scheduleSaveChatStoreViaApi,
} from "@/lib/chat-store-api.client";
import { getChatStorePersistenceMode } from "@/lib/chat-store-backend";
import {
  createWorkspace,
  ensureWorkspacesMigrated,
  getActiveWorkspace,
  getWorkspaceById,
  inheritThreadWorkingDirectory,
  migrateThreadWorkingDirectories,
  remapThreadsToKnownWorkspaces,
  syncLegacyWorkingDirectory,
  threadsForWorkspace,
  type ChatWorkspace,
} from "@/lib/chat-workspace";
import type { ActionDesignerThreadRef } from "@/lib/action-designer-thread";
import { deriveProvisionalThreadTitle } from "@/lib/thread-title";
import { chatMessagesEqual } from "@/lib/chat-message-signature";

export type { ChatWorkspace } from "@/lib/chat-workspace";
export {
  createWorkspace,
  defaultWorkspaceLabel,
  getActiveWorkspace,
  getWorkspaceById,
  inheritThreadWorkingDirectory,
  migrateThreadWorkingDirectories,
  resolveThreadWorkingDirectory,
  threadsForWorkspace,
} from "@/lib/chat-workspace";

export type ChatThread = {
  id: string;
  title: string;
  messages: AgentUIMessage[];
  updatedAt: number;
  /** Per-thread working directory; empty = server default cwd. */
  workingDirectory?: string;
  /** ActionDesigner that created / owns this thread (embed mode). */
  actionDesigner?: ActionDesignerThreadRef;
  /** @deprecated Legacy workspace linkage; prefer workingDirectory. */
  workspaceId?: string;
  /** LLM title applied; legacy threads with a derived title are treated as done. */
  titleGenerated?: boolean;
  /** User renamed in sidebar; skip auto title updates. */
  titleManual?: boolean;
  /**
   * Persisted message count, stored in the v3 index. With lazy hydration
   * (messageScope "active") `messages` may be [] for threads that DO have
   * persisted messages; this count is the authority for emptiness checks.
   * `undefined` = unknown (legacy index meta) and must be treated as non-empty.
   */
  messageCount?: number;
};

export type ChatStoreData = {
  version: 3;
  activeThreadId: string;
  /** Sidebar workspace filter / cwd scope for new threads. */
  activeWorkspaceId: string;
  workspaces: ChatWorkspace[];
  threads: ChatThread[];
  /** Thread ids shown in the titlebar tab strip (order preserved). */
  openTabIds: string[];
  /** User has explicitly opened/closed titlebar tabs since this field existed. */
  tabStripPersisted?: boolean;
  /** Legacy single cwd mirror of active workspace rootPath (persisted for migration). */
  workingDirectory: string;
};

export {
  CHAT_STORAGE_KEY,
  CHAT_STORAGE_BACKUP_KEY,
  CHAT_STORE_VERSION,
  CHAT_THREAD_KEY_PREFIX,
  threadStorageKey,
  threadBackupStorageKey,
} from "@/lib/chat-store-persist";
import {
  assembleStoreFromV3Parts,
  backupPersistedChatStoreIndex,
  hydrateStoreThreadMessages,
  loadPersistedChatStore,
  loadPersistedChatStoreFromBackup,
  loadThreadMessagesFromStorage,
  migrateMonolithicStoreToChunked,
  savePersistedChatStore,
  toChatStoreIndex,
  getLastPersistedSnapshot,
  tryParseV3Index,
  CHAT_STORAGE_KEY,
  CHAT_STORAGE_BACKUP_KEY,
  CHAT_STORE_VERSION,
  CHAT_THREAD_BACKUP_KEY_PREFIX,
  CHAT_THREAD_KEY_PREFIX,
  threadStorageKey,
  threadBackupStorageKey,
} from "@/lib/chat-store-persist";

export { hydrateStoreThreadMessages };
const LEGACY_WORKSPACE_STORAGE_KEY = "agent-gui-workspaces";

function now(): number {
  return Date.now();
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** @deprecated Use deriveProvisionalThreadTitle — kept for imports. */
export function deriveThreadTitle(messages: AgentUIMessage[]): string {
  return deriveProvisionalThreadTitle(messages);
}

function createThread(options?: {
  workspaceId?: string;
  workingDirectory?: string;
  actionDesigner?: ActionDesignerThreadRef;
}): ChatThread {
  const ts = now();
  return {
    id: createId(),
    title: "新对话",
    messages: [],
    updatedAt: ts,
    titleGenerated: false,
    titleManual: false,
    messageCount: 0,
    workingDirectory: options?.workingDirectory?.trim() ?? "",
    actionDesigner: options?.actionDesigner,
    workspaceId: options?.workspaceId,
  };
}

/** Effective persisted message count; trusts messageCount when messages are not hydrated. */
export function threadMessageCount(thread: ChatThread): number {
  if (thread.messages.length > 0) return thread.messages.length;
  return thread.messageCount ?? 0;
}

/** True when the thread has persisted messages (hydrated or counted in the index). */
export function threadHasMessages(thread: ChatThread): boolean {
  return threadMessageCount(thread) > 0;
}

export function chatStoreHasPersistedMessages(store: ChatStoreData): boolean {
  return store.threads.some(threadHasMessages);
}

export function countPersistedMessages(store: ChatStoreData): number {
  return store.threads.reduce((total, thread) => total + threadMessageCount(thread), 0);
}

/** True when saving `next` would clear messages that existed in `prev`. */
export function shouldBackupChatStoreBeforeSave(
  prev: ChatStoreData,
  next: ChatStoreData,
): boolean {
  const prevTotal = countPersistedMessages(prev);
  if (prevTotal === 0) return false;
  const nextTotal = countPersistedMessages(next);
  if (nextTotal === 0) return true;

  for (const prevThread of prev.threads) {
    if (!threadHasMessages(prevThread)) continue;
    const nextThread = next.threads.find((thread) => thread.id === prevThread.id);
    if (!nextThread || !threadHasMessages(nextThread)) {
      return true;
    }
  }
  return false;
}

function tryLoadChatStoreBackup(): ChatStoreData | null {
  if (typeof window === "undefined") return null;
  try {
    const chunked = loadPersistedChatStoreFromBackup();
    if (chunked && chatStoreHasPersistedMessages(chunked)) {
      return chunked;
    }

    const backup = localStorage.getItem(CHAT_STORAGE_BACKUP_KEY);
    if (!backup) return null;
    const store = normalizeStore(JSON.parse(backup) as Partial<ChatStoreData>);
    return chatStoreHasPersistedMessages(store) ? store : null;
  } catch {
    return null;
  }
}

function maybeRestoreFromBackup(current: ChatStoreData): ChatStoreData {
  if (chatStoreHasPersistedMessages(current)) return current;
  // Replace-style restore is only safe when every thread is *known* empty;
  // unknown counts (legacy index metas) may still have message blobs on disk.
  if (!current.threads.every(isThreadEmpty)) return current;
  const restored = tryLoadChatStoreBackup();
  if (!restored) return current;
  saveChatStore(restored);
  return restored;
}

/**
 * True only when the thread is KNOWN to be empty. Threads loaded from the v3
 * index without hydrated messages must never be treated as empty unless the
 * index explicitly recorded `messageCount: 0` — otherwise compaction would
 * destroy sidebar history on every app restart.
 */
export function isThreadEmpty(thread: ChatThread): boolean {
  if (thread.messages.length > 0) return false;
  return thread.messageCount === 0;
}

/**
 * Drop orphan empty threads not shown in the tab strip; keep every open-tab empty.
 */
export function compactEmptyThreads(data: ChatStoreData): ChatStoreData {
  const migrated = ensureWorkspacesMigrated(data);
  if (migrated.threads.length === 0) {
    const workspaceId = migrated.activeWorkspaceId;
    const thread = createThread({
      workspaceId,
      workingDirectory: inheritThreadWorkingDirectory(migrated),
    });
    return {
      ...migrated,
      threads: [thread],
      activeThreadId: thread.id,
      openTabIds: [thread.id],
    };
  }
  data = migrated;

  const openTabSet = new Set(data.openTabIds);
  const emptyOpen = data.threads.filter(
    (t) => isThreadEmpty(t) && openTabSet.has(t.id),
  );

  const keepIds = new Set<string>([
    ...data.threads.filter((t) => !isThreadEmpty(t)).map((t) => t.id),
    ...emptyOpen.map((t) => t.id),
  ]);

  const threads = data.threads.filter((t) => keepIds.has(t.id));

  let activeThreadId = data.activeThreadId;
  if (!threads.some((t) => t.id === activeThreadId)) {
    activeThreadId = threads[0]!.id;
  }

  let openTabIds = data.openTabIds.filter((id) =>
    threads.some((t) => t.id === id),
  );
  if (openTabIds.length === 0) {
    openTabIds = [activeThreadId];
  }

  return { ...data, threads, activeThreadId, openTabIds };
}

export function defaultChatStore(): ChatStoreData {
  const workspace = createWorkspace();
  const thread = createThread({ workspaceId: workspace.id, workingDirectory: "" });
  return {
    version: CHAT_STORE_VERSION,
    activeThreadId: thread.id,
    activeWorkspaceId: workspace.id,
    workspaces: [workspace],
    threads: [thread],
    openTabIds: [thread.id],
    workingDirectory: "",
  };
}

function normalizeOpenTabIds(
  raw: unknown,
  threads: ChatThread[],
  activeThreadId: string,
  tabStripPersisted?: boolean,
): string[] {
  const threadIds = new Set(threads.map((t) => t.id));
  let openTabIds = Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === "string" && threadIds.has(id))
    : [];

  if (openTabIds.length === 0) {
    openTabIds = threadIds.has(activeThreadId)
      ? [activeThreadId]
      : [threads[0]!.id];
  }

  // Repair legacy/import state that opened every thread in the titlebar tab strip.
  const fullTabStripExpansion =
    threads.length > 1
    && openTabIds.length === threads.length
    && threads.every((t) => openTabIds.includes(t.id));
  if (
    fullTabStripExpansion
    && (
      tabStripPersisted !== true
      || threads.length > MAX_OPEN_CHAT_TABS
    )
  ) {
    openTabIds = threadIds.has(activeThreadId)
      ? [activeThreadId]
      : [threads[0]!.id];
  }

  if (!openTabIds.includes(activeThreadId) && threadIds.has(activeThreadId)) {
    openTabIds = [...openTabIds, activeThreadId];
  }

  return openTabIds;
}

/** Ensure required arrays exist before migration / UI render (runtime JSON may omit fields). */
export function coerceChatStoreShape(data: ChatStoreData): ChatStoreData {
  const workspaces = Array.isArray(data.workspaces) ? data.workspaces : [];
  const threads = Array.isArray(data.threads) ? data.threads : [];
  const openTabIds = Array.isArray(data.openTabIds) ? data.openTabIds : [];
  const activeWorkspaceId =
    typeof data.activeWorkspaceId === "string" ? data.activeWorkspaceId : "";
  const activeThreadId =
    typeof data.activeThreadId === "string" ? data.activeThreadId : "";
  const workingDirectory =
    typeof data.workingDirectory === "string" ? data.workingDirectory : "";

  if (
    workspaces === data.workspaces
    && threads === data.threads
    && openTabIds === data.openTabIds
    && activeWorkspaceId === data.activeWorkspaceId
    && activeThreadId === data.activeThreadId
    && workingDirectory === data.workingDirectory
  ) {
    return data;
  }

  return {
    ...data,
    workspaces,
    threads,
    openTabIds,
    activeWorkspaceId,
    activeThreadId,
    workingDirectory,
  };
}

/** Normalize tab strip and empty-thread policy after load or legacy merge. */
export function normalizeLoadedStore(data: ChatStoreData): ChatStoreData {
  const migrated = migrateThreadWorkingDirectories(
    remapThreadsToKnownWorkspaces(
      ensureWorkspacesMigrated(coerceChatStoreShape(data)),
    ),
  );
  const openTabIds = normalizeOpenTabIds(
    migrated.openTabIds,
    migrated.threads,
    migrated.activeThreadId,
    migrated.tabStripPersisted,
  );
  return syncLegacyWorkingDirectory(
    applyOpenTabPolicy(
      compactEmptyThreads({
        ...migrated,
        openTabIds,
      }),
    ),
  );
}

function tabStripStateChanged(
  before: Partial<ChatStoreData>,
  after: ChatStoreData,
): boolean {
  if (openTabIdsChanged(before.openTabIds, after.openTabIds)) return true;
  return before.tabStripPersisted !== after.tabStripPersisted;
}

function openTabIdsChanged(before: unknown, after: string[]): boolean {
  if (!Array.isArray(before)) return true;
  if (before.length !== after.length) return true;
  return before.some((id, index) => id !== after[index]);
}

function withTabStripPersisted(data: ChatStoreData): ChatStoreData {
  return data.tabStripPersisted === true
    ? data
    : { ...data, tabStripPersisted: true };
}

/** Titlebar tab strip cap; overflow tabs are hidden, not deleted (sidebar history kept). */
export const MAX_OPEN_CHAT_TABS = 8;

function threadById(threads: ChatThread[]): Map<string, ChatThread> {
  return new Map(threads.map((t) => [t.id, t]));
}

/**
 * Enforce tab cap: close inactive tabs from the strip (left-to-right among empties,
 * then least-recently-updated among the rest). Never hides the active tab.
 */
function pruneOpenTabIds(
  openTabIds: string[],
  threads: ChatThread[],
  activeThreadId: string,
  maxTabs: number = MAX_OPEN_CHAT_TABS,
): string[] {
  if (openTabIds.length <= maxTabs) return openTabIds;

  const byId = threadById(threads);
  let ids = [...openTabIds];

  while (ids.length > maxTabs) {
    const inactive = ids.filter((id) => id !== activeThreadId);
    if (inactive.length === 0) break;

    const emptyInactive = inactive.filter((id) => {
      const t = byId.get(id);
      return t !== undefined && isThreadEmpty(t);
    });

    let victimId: string;
    if (emptyInactive.length > 0) {
      victimId = emptyInactive[0]!;
    } else {
      victimId = inactive.reduce((oldest, id) => {
        const t = byId.get(id);
        const o = byId.get(oldest);
        if (!t) return oldest;
        if (!o) return id;
        return t.updatedAt < o.updatedAt ? id : oldest;
      }, inactive[0]!);
    }

    ids = ids.filter((id) => id !== victimId);
  }

  return ids;
}

function applyOpenTabPolicy(data: ChatStoreData): ChatStoreData {
  let openTabIds = data.openTabIds;
  openTabIds = pruneOpenTabIds(
    openTabIds,
    data.threads,
    data.activeThreadId,
  );
  if (
    openTabIds.length === data.openTabIds.length
    && openTabIds.every((id, i) => id === data.openTabIds[i])
  ) {
    return data;
  }
  return { ...data, openTabIds };
}

function normalizeThreads(raw: unknown): ChatThread[] {
  const threads: ChatThread[] = [];
  if (!Array.isArray(raw)) return threads;

  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const t = item as Partial<ChatThread>;
    if (typeof t.id !== "string" || typeof t.title !== "string") continue;
    const messages = Array.isArray(t.messages)
      ? (t.messages as AgentUIMessage[])
      : [];
    const titleGenerated =
      t.titleGenerated === true
      || (t.titleGenerated !== false
        && messages.length > 0
        && t.title !== "新对话");
    threads.push({
      id: t.id,
      title: t.title,
      messages,
      updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : now(),
      titleGenerated,
      titleManual: t.titleManual === true,
      messageCount: messages.length,
      workspaceId: typeof t.workspaceId === "string" ? t.workspaceId : undefined,
      workingDirectory:
        typeof t.workingDirectory === "string" ? t.workingDirectory : undefined,
      actionDesigner: normalizeActionDesignerRef(
        (t as { actionDesigner?: unknown }).actionDesigner,
      ),
    });
  }
  return threads;
}

function normalizeActionDesignerRef(
  raw: unknown,
): ActionDesignerThreadRef | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const item = raw as Partial<ActionDesignerThreadRef>;
  const entityId = typeof item.entityId === "string" ? item.entityId.trim() : "";
  if (!entityId) return undefined;
  return { entityId, isSubProgram: item.isSubProgram === true };
}

function normalizeStore(raw: unknown): ChatStoreData {
  if (typeof raw !== "object" || raw === null) {
    return defaultChatStore();
  }

  const data = raw as Partial<ChatStoreData>;
  const storeVersion = data.version as number | undefined;
  if (
    (storeVersion === 2 || storeVersion === CHAT_STORE_VERSION)
    && Array.isArray(data.threads)
    && data.threads.length > 0
  ) {
    const threads = normalizeThreads(data.threads);
    if (threads.length === 0) return defaultChatStore();

    const activeThreadId =
      typeof data.activeThreadId === "string"
      && threads.some((t) => t.id === data.activeThreadId)
        ? data.activeThreadId
        : threads[0]!.id;

    const tabStripPersisted = data.tabStripPersisted === true;
    const openTabIds = normalizeOpenTabIds(
      data.openTabIds,
      threads,
      activeThreadId,
      tabStripPersisted,
    );

    const workingDirectory =
      typeof data.workingDirectory === "string" ? data.workingDirectory : "";
    return normalizeLoadedStore(
      compactEmptyThreads({
        version: CHAT_STORE_VERSION,
        activeThreadId,
        activeWorkspaceId: "",
        workspaces: [],
        threads,
        openTabIds,
        tabStripPersisted,
        workingDirectory,
      }),
    );
  }

  return defaultChatStore();
}

/** Migrate legacy multi-workspace localStorage (v1). */
function migrateLegacyWorkspaceStore(raw: unknown): ChatStoreData | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as {
    version?: number;
    activeWorkspaceId?: string;
    activeThreadId?: string;
    workspaces?: Array<{
      id?: string;
      rootPath?: string;
      threads?: unknown;
    }>;
  };

  if (data.version !== 1 || !Array.isArray(data.workspaces) || data.workspaces.length === 0) {
    return null;
  }

  const activeWorkspace =
    data.workspaces.find((w) => w.id === data.activeWorkspaceId) ?? data.workspaces[0];

  const workspaces: ChatWorkspace[] = [];
  const threadMap = new Map<string, ChatThread>();

  for (const ws of data.workspaces) {
    if (typeof ws?.id !== "string") continue;
    const rootPath = typeof ws.rootPath === "string" ? ws.rootPath : "";
    workspaces.push({
      id: ws.id,
      rootPath,
      label: typeof (ws as { label?: string }).label === "string"
        ? (ws as { label?: string }).label
        : undefined,
    });
    for (const thread of normalizeThreads(ws?.threads)) {
      const withWorkspace = { ...thread, workspaceId: ws.id };
      const existing = threadMap.get(thread.id);
      if (!existing || withWorkspace.updatedAt > existing.updatedAt) {
        threadMap.set(thread.id, withWorkspace);
      }
    }
  }

  const threads = [...threadMap.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  if (threads.length === 0) return null;

  const activeThreadId =
    typeof data.activeThreadId === "string"
    && threads.some((t) => t.id === data.activeThreadId)
      ? data.activeThreadId
      : threads[0]!.id;

  const activeWorkspaceId =
    typeof data.activeWorkspaceId === "string"
    && workspaces.some((ws) => ws.id === data.activeWorkspaceId)
      ? data.activeWorkspaceId
      : workspaces[0]?.id ?? "";

  for (const thread of threads) {
    if (!thread.workspaceId && activeWorkspaceId) {
      thread.workspaceId = activeWorkspaceId;
    }
  }

  return normalizeLoadedStore(
    compactEmptyThreads({
      version: CHAT_STORE_VERSION,
      activeThreadId,
      activeWorkspaceId,
      workspaces,
      threads,
      openTabIds: normalizeOpenTabIds(undefined, threads, activeThreadId),
      workingDirectory:
        typeof activeWorkspace?.rootPath === "string" ? activeWorkspace.rootPath : "",
    }),
  );
}

/** Load from WebView localStorage only (migration source + unit tests). */
export function loadChatStoreFromLocalStorage(): ChatStoreData {
  if (typeof window === "undefined") return defaultChatStore();

  try {
    const current = localStorage.getItem(CHAT_STORAGE_KEY);
    if (current) {
      const raw = JSON.parse(current) as Partial<ChatStoreData>;

      if (raw.version === CHAT_STORE_VERSION) {
        const chunked = loadPersistedChatStore({ messageScope: "active" });
        if (chunked) {
          const restored = maybeRestoreFromBackup(chunked);
          const normalized = normalizeLoadedStore(restored);
          if (
            openTabIdsChanged(restored.openTabIds, normalized.openTabIds)
            || restored.threads.length !== normalized.threads.length
            || restored.activeThreadId !== normalized.activeThreadId
          ) {
            saveChatStore(normalized);
          }
          return normalized;
        }
      }

      if ((raw.version as number | undefined) === 2 && Array.isArray(raw.threads)) {
        let store = normalizeStore(raw);
        store = maybeRestoreFromBackup(store);
        migrateMonolithicStoreToChunked(store);
        return store;
      }
    }

    const legacy = localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY);
    if (legacy) {
      const migrated = migrateLegacyWorkspaceStore(JSON.parse(legacy) as unknown);
      if (migrated) {
        migrateMonolithicStoreToChunked(migrated);
        return migrated;
      }
    }

    const restored = tryLoadChatStoreBackup();
    if (restored) {
      saveChatStore(restored);
      return restored;
    }
  } catch {
    /* fall through */
  }

  return defaultChatStore();
}

/** @deprecated Prefer fetchChatStoreFromApi in production; sync localStorage path for tests. */
export function loadChatStore(): ChatStoreData {
  return loadChatStoreFromLocalStorage();
}

function saveChatStoreToLocalStorage(data: ChatStoreData): void {
  try {
    const previous = getLastPersistedSnapshot();
    if (previous && shouldBackupChatStoreBeforeSave(previous, data)) {
      backupPersistedChatStoreIndex(toChatStoreIndex(previous));
    }
    savePersistedChatStore(data, { previous });
  } catch {
    /* ignore quota errors */
  }
}

export function saveChatStore(data: ChatStoreData): void {
  if (typeof window === "undefined") return;
  if (getChatStorePersistenceMode() === "api") {
    // Do NOT mark `data` as persisted here: the persisted snapshot is the
    // `previous` diff base sent to the server, so updating it before the PUT
    // succeeds makes every save a no-op diff (nothing written to SQLite).
    scheduleSaveChatStoreViaApi(data);
    return;
  }
  saveChatStoreToLocalStorage(data);
}

type ResolvedThreadMessages = {
  messages: AgentUIMessage[];
  migratedFromLocalStorage: boolean;
};

const threadMessagesInflight = new Map<string, Promise<ResolvedThreadMessages>>();

/** Load persisted messages for one thread (deduped in-flight; API + localStorage fallback). */
export async function resolveThreadMessagesAsync(
  threadId: string,
): Promise<ResolvedThreadMessages> {
  const inflight = threadMessagesInflight.get(threadId);
  if (inflight) return inflight;

  const promise = (async (): Promise<ResolvedThreadMessages> => {
    const apiMode = getChatStorePersistenceMode() === "api";
    if (!apiMode) {
      return {
        messages: loadThreadMessagesFromStorage(threadId),
        migratedFromLocalStorage: false,
      };
    }

    const fromApi = await fetchThreadMessagesFromApi(threadId);
    if (fromApi.length > 0) {
      return { messages: fromApi, migratedFromLocalStorage: false };
    }

    let messages = loadThreadMessagesFromStorage(threadId);
    if (messages.length === 0) {
      messages = loadThreadMessagesFromStorage(threadId, { preferBackup: true });
    }
    return {
      messages,
      migratedFromLocalStorage: messages.length > 0,
    };
  })();

  threadMessagesInflight.set(threadId, promise);
  try {
    return await promise;
  } finally {
    threadMessagesInflight.delete(threadId);
  }
}

/** Merge hydrated messages into an existing store without changing active tab / tabs. */
export function applyThreadMessagesToStore(
  store: ChatStoreData,
  threadId: string,
  messages: AgentUIMessage[],
): ChatStoreData {
  if (messages.length === 0) return store;
  return {
    ...store,
    threads: store.threads.map((item) =>
      item.id === threadId
        ? { ...item, messages, messageCount: messages.length }
        : item,
    ),
  };
}

/** Hydrate one thread's messages from persistence (sync store update after await). */
export async function hydrateStoreThreadMessagesAsync(
  store: ChatStoreData,
  threadId: string,
): Promise<ChatStoreData> {
  const thread = store.threads.find((item) => item.id === threadId);
  if (!thread || thread.messages.length > 0) {
    return store;
  }

  const { messages, migratedFromLocalStorage } =
    await resolveThreadMessagesAsync(threadId);
  if (messages.length === 0) {
    return store;
  }

  const next = applyThreadMessagesToStore(store, threadId, messages);

  if (migratedFromLocalStorage) {
    scheduleSaveChatStoreViaApi(next);
  }

  return next;
}

/** Hydrate multiple open tabs in parallel (boot / tab strip prefetch). */
export async function hydrateStoreThreadsParallel(
  store: ChatStoreData,
  threadIds: string[],
): Promise<ChatStoreData> {
  const pending = [...new Set(threadIds)].filter((threadId) => {
    const thread = store.threads.find((item) => item.id === threadId);
    return thread && thread.messages.length === 0;
  });
  if (pending.length === 0) return store;

  const resolved = await Promise.all(
    pending.map(async (threadId) => ({
      threadId,
      ...(await resolveThreadMessagesAsync(threadId)),
    })),
  );

  let next = store;
  let migrated = false;
  for (const { threadId, messages, migratedFromLocalStorage } of resolved) {
    if (messages.length === 0) continue;
    next = applyThreadMessagesToStore(next, threadId, messages);
    migrated ||= migratedFromLocalStorage;
  }

  if (migrated) {
    scheduleSaveChatStoreViaApi(next);
  }

  return next;
}

let pendingChatStoreSave: ChatStoreData | null = null;
let chatStoreSaveScheduled = false;

/** Defer large JSON writes so streaming UI stays responsive. */
export function scheduleSaveChatStore(data: ChatStoreData): void {
  if (typeof window === "undefined") return;
  if (getChatStorePersistenceMode() === "api") {
    // See saveChatStore: the persisted snapshot must only advance after the
    // server PUT succeeds, otherwise the server-side diff sees no changes.
    scheduleSaveChatStoreViaApi(data);
    return;
  }
  pendingChatStoreSave = data;
  if (chatStoreSaveScheduled) return;
  chatStoreSaveScheduled = true;

  const flush = () => {
    chatStoreSaveScheduled = false;
    const snapshot = pendingChatStoreSave;
    pendingChatStoreSave = null;
    if (snapshot) {
      saveChatStoreToLocalStorage(snapshot);
    }
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(flush, { timeout: 1500 });
  } else {
    window.setTimeout(flush, 0);
  }
}

/** Flush any deferred chat store write (e.g. before page hide). */
export function flushPendingChatStoreSave(): void {
  void flushPendingChatStoreSaveAsync();
}

/** Await deferred chat store write before desktop shutdown. */
export async function flushPendingChatStoreSaveAsync(
  options?: { keepalive?: boolean },
): Promise<void> {
  if (typeof window === "undefined") return;
  if (getChatStorePersistenceMode() === "api") {
    await flushPendingChatStoreApiSaveAsync(options);
    return;
  }
  if (!pendingChatStoreSave) return;
  const snapshot = pendingChatStoreSave;
  pendingChatStoreSave = null;
  chatStoreSaveScheduled = false;
  saveChatStoreToLocalStorage(snapshot);
}

export function getActiveThread(data: ChatStoreData): ChatThread {
  return data.threads.find((t) => t.id === data.activeThreadId) ?? data.threads[0]!;
}

export function getOpenTabThreads(data: ChatStoreData): ChatThread[] {
  const byId = new Map(data.threads.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const threads: ChatThread[] = [];
  for (const id of data.openTabIds) {
    if (seen.has(id)) continue;
    const thread = byId.get(id);
    if (!thread) continue;
    seen.add(id);
    threads.push(thread);
  }
  return threads;
}

export function sortThreads(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((a, b) => {
    const byTime = b.updatedAt - a.updatedAt;
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}

/** True when persisted message snapshots are equivalent (ignore select/reopen). */
export function threadMessagesEqual(
  a: AgentUIMessage[],
  b: AgentUIMessage[],
): boolean {
  return chatMessagesEqual(a, b);
}

export function updateThreadMessages(
  data: ChatStoreData,
  threadId: string,
  messages: AgentUIMessage[],
): ChatStoreData {
  const thread = data.threads.find((t) => t.id === threadId);
  if (!thread) return data;
  if (threadMessagesEqual(thread.messages, messages)) {
    return data;
  }

  // Guard against useChat hydrating with [] before localStorage is read.
  if (messages.length === 0 && thread.messages.length > 0) {
    return data;
  }

  const hadContent = thread.messages.length > 0;
  const next: ChatStoreData = {
    ...data,
    threads: data.threads.map((t) => {
      if (t.id !== threadId) return t;
      const ts = now();
      const shouldSetProvisionalTitle =
        messages.length > 0
        && !thread.titleManual
        && !thread.titleGenerated;
      return {
        ...thread,
        messages,
        messageCount: messages.length,
        title: shouldSetProvisionalTitle
          ? deriveThreadTitle(messages)
          : thread.title,
        updatedAt: ts,
      };
    }),
  };
  return next;
}

export function addThread(
  data: ChatStoreData,
  options?: {
    workspaceId?: string;
    workingDirectory?: string;
    actionDesigner?: ActionDesignerThreadRef;
  },
): ChatStoreData {
  const workspaceId = options?.workspaceId ?? data.activeWorkspaceId;
  const workingDirectory =
    options?.workingDirectory?.trim()
    ?? inheritThreadWorkingDirectory(data);
  const active = data.threads.find((item) => item.id === data.activeThreadId);
  const actionDesigner =
    options?.actionDesigner
    ?? active?.actionDesigner;
  const thread = createThread({ workspaceId, workingDirectory, actionDesigner });
  const activeIndex = data.threads.findIndex((t) => t.id === data.activeThreadId);
  const insertAt = activeIndex >= 0 ? activeIndex + 1 : data.threads.length;
  const threads = [...data.threads];
  threads.splice(insertAt, 0, thread);

  const tabIndex = data.openTabIds.indexOf(data.activeThreadId);
  const openTabIds = [...data.openTabIds];
  openTabIds.splice(
    tabIndex >= 0 ? tabIndex + 1 : openTabIds.length,
    0,
    thread.id,
  );

  return withTabStripPersisted(
    applyOpenTabPolicy(
      compactEmptyThreads({
        ...data,
        activeThreadId: thread.id,
        threads,
        openTabIds,
      }),
    ),
  );
}

export function selectThread(data: ChatStoreData, threadId: string): ChatStoreData {
  if (!data.threads.some((t) => t.id === threadId)) return data;
  return applyOpenTabPolicy({ ...data, activeThreadId: threadId });
}

/** Open a thread in the tab strip (sidebar) and focus it. */
export function openThread(data: ChatStoreData, threadId: string): ChatStoreData {
  if (!data.threads.some((t) => t.id === threadId)) return data;
  const openTabIds = data.openTabIds.includes(threadId)
    ? data.openTabIds
    : [...data.openTabIds, threadId];
  return withTabStripPersisted(
    applyOpenTabPolicy({ ...data, openTabIds, activeThreadId: threadId }),
  );
}

/** Hide a tab without deleting the conversation (sidebar history kept). */
export function closeTab(data: ChatStoreData, threadId: string): ChatStoreData {
  if (!data.openTabIds.includes(threadId)) return data;

  const tabIndex = data.openTabIds.indexOf(threadId);
  const openTabIds = data.openTabIds.filter((id) => id !== threadId);
  let { activeThreadId, threads } = data;

  if (activeThreadId === threadId) {
    if (openTabIds.length > 0) {
      activeThreadId = openTabIds[Math.min(tabIndex, openTabIds.length - 1)]!;
    } else {
      const existingEmpty = threads.find(isThreadEmpty);
      if (existingEmpty) {
        activeThreadId = existingEmpty.id;
        openTabIds.push(existingEmpty.id);
      } else {
        const thread = createThread({
          workspaceId: data.activeWorkspaceId,
          workingDirectory: inheritThreadWorkingDirectory(data),
        });
        threads = [...threads, thread];
        activeThreadId = thread.id;
        openTabIds.push(thread.id);
      }
    }
  }

  return withTabStripPersisted({ ...data, threads, openTabIds, activeThreadId });
}

export function deleteThread(data: ChatStoreData, threadId: string): ChatStoreData {
  const index = data.threads.findIndex((t) => t.id === threadId);
  if (index < 0) return data;

  let threads = data.threads.filter((t) => t.id !== threadId);
  let openTabIds = data.openTabIds.filter((id) => id !== threadId);
  let activeThreadId = data.activeThreadId;

  if (data.activeThreadId === threadId) {
    if (openTabIds.length > 0) {
      const closedTabIndex = data.openTabIds.indexOf(threadId);
      activeThreadId = openTabIds[
        Math.min(closedTabIndex, openTabIds.length - 1)
      ]!;
    } else if (threads.length > 0) {
      activeThreadId = threads[Math.min(index, threads.length - 1)]!.id;
    } else {
      const thread = createThread({
        workspaceId: data.activeWorkspaceId,
        workingDirectory: inheritThreadWorkingDirectory(data),
      });
      threads = [thread];
      activeThreadId = thread.id;
      openTabIds = [thread.id];
    }
  }

  if (openTabIds.length === 0 && threads.length > 0) {
    const existingEmpty = threads.find(isThreadEmpty);
    if (existingEmpty) {
      activeThreadId = existingEmpty.id;
      openTabIds = [existingEmpty.id];
    } else {
      const thread = createThread({
        workspaceId: data.activeWorkspaceId,
        workingDirectory: inheritThreadWorkingDirectory(data),
      });
      threads = [...threads, thread];
      activeThreadId = thread.id;
      openTabIds = [thread.id];
    }
  }

  return compactEmptyThreads({ ...data, threads, openTabIds, activeThreadId });
}

export function renameThread(
  data: ChatStoreData,
  threadId: string,
  title: string,
): ChatStoreData {
  const trimmed = title.trim();
  if (!trimmed) return data;
  return {
    ...data,
    threads: data.threads.map((thread) =>
      thread.id === threadId
        ? { ...thread, title: trimmed, titleManual: true, titleGenerated: true }
        : thread,
    ),
  };
}

export function updateThreadTitle(
  data: ChatStoreData,
  threadId: string,
  title: string,
): ChatStoreData {
  const trimmed = title.trim();
  if (!trimmed || trimmed === "新对话") return data;
  return {
    ...data,
    threads: data.threads.map((thread) => {
      if (thread.id !== threadId) return thread;
      if (thread.titleManual) return thread;
      if (thread.titleGenerated && thread.title === trimmed) return thread;
      return {
        ...thread,
        title: trimmed,
        titleGenerated: true,
        updatedAt: now(),
      };
    }),
  };
}

export function setThreadWorkingDirectory(
  data: ChatStoreData,
  threadId: string,
  workingDirectory: string,
): ChatStoreData {
  const trimmed = workingDirectory.trim();
  const threads = data.threads.map((thread) =>
    thread.id === threadId ? { ...thread, workingDirectory: trimmed } : thread,
  );
  let next: ChatStoreData = { ...data, threads };
  if (threadId === data.activeThreadId) {
    next = syncLegacyWorkingDirectory({
      ...next,
      workingDirectory: trimmed,
    });
  }
  return next;
}

export function setWorkingDirectory(
  data: ChatStoreData,
  workingDirectory: string,
): ChatStoreData {
  return setThreadWorkingDirectory(data, data.activeThreadId, workingDirectory);
}

export function selectWorkspace(
  data: ChatStoreData,
  workspaceId: string,
): ChatStoreData {
  if (!data.workspaces.some((ws) => ws.id === workspaceId)) return data;
  const next = syncLegacyWorkingDirectory({
    ...data,
    activeWorkspaceId: workspaceId,
  });
  const workspaceThreads = threadsForWorkspace(next.threads, workspaceId);
  if (workspaceThreads.length === 0) {
    return addThread(next, { workspaceId });
  }
  const recent = sortThreads(workspaceThreads)[0]!;
  return openThread(
    syncLegacyWorkingDirectory({ ...next, activeThreadId: recent.id }),
    recent.id,
  );
}

export function addWorkspace(
  data: ChatStoreData,
  rootPath: string,
  label?: string,
): ChatStoreData {
  const workspace = createWorkspace(rootPath, label);
  const next = syncLegacyWorkingDirectory({
    ...data,
    workspaces: [...data.workspaces, workspace],
    activeWorkspaceId: workspace.id,
    workingDirectory: workspace.rootPath,
  });
  return addThread(next, { workspaceId: workspace.id });
}

export function setWorkspaceRootPath(
  data: ChatStoreData,
  workspaceId: string,
  rootPath: string,
): ChatStoreData {
  const trimmed = rootPath.trim();
  const workspaces = data.workspaces.map((ws) =>
    ws.id === workspaceId ? { ...ws, rootPath: trimmed } : ws,
  );
  const next: ChatStoreData = {
    ...data,
    workspaces,
    workingDirectory:
      workspaceId === data.activeWorkspaceId ? trimmed : data.workingDirectory,
  };
  return syncLegacyWorkingDirectory(next);
}

export function removeWorkspace(
  data: ChatStoreData,
  workspaceId: string,
): ChatStoreData {
  if (data.workspaces.length <= 1) return data;
  const fallback = data.workspaces.find((ws) => ws.id !== workspaceId);
  if (!fallback) return data;

  const threads = data.threads.map((thread) =>
    thread.workspaceId === workspaceId
      ? { ...thread, workspaceId: fallback.id }
      : thread,
  );
  const workspaces = data.workspaces.filter((ws) => ws.id !== workspaceId);
  let next: ChatStoreData = {
    ...data,
    workspaces,
    threads,
    activeWorkspaceId:
      data.activeWorkspaceId === workspaceId ? fallback.id : data.activeWorkspaceId,
  };
  next = syncLegacyWorkingDirectory(next);
  if (!threadsForWorkspace(next.threads, next.activeWorkspaceId).length) {
    next = addThread(next, { workspaceId: next.activeWorkspaceId });
  } else if (!next.threads.some((t) => t.id === next.activeThreadId)) {
    const recent = sortThreads(
      threadsForWorkspace(next.threads, next.activeWorkspaceId),
    )[0]!;
    next = { ...next, activeThreadId: recent.id };
  }
  return next;
}

/** Sidebar workspace path: active workspace override or server default cwd. */
export function resolveStoreWorkingDirectory(
  data: Pick<ChatStoreData, "workspaces" | "activeWorkspaceId" | "workingDirectory">,
  defaultCwd = "",
): string {
  const active = getActiveWorkspace(data as ChatStoreData);
  return active.rootPath.trim() || data.workingDirectory.trim() || defaultCwd.trim();
}

export type LegacyChatRestoreResult = {
  ok: boolean;
  title: string;
  body: string;
  sources: string[];
  importedThreadCount: number;
  updatedThreadCount: number;
};

function pickRicherThread(a: ChatThread, b: ChatThread): ChatThread {
  if (b.messages.length !== a.messages.length) {
    return b.messages.length > a.messages.length ? b : a;
  }
  return b.updatedAt >= a.updatedAt ? b : a;
}

function mergeChatStoreFromLegacy(
  current: ChatStoreData,
  imported: ChatStoreData,
): { store: ChatStoreData; importedCount: number; updatedCount: number } {
  const byId = new Map(current.threads.map((t) => [t.id, t]));
  let importedCount = 0;
  let updatedCount = 0;

  for (const thread of imported.threads) {
    // Only merge threads whose messages were actually recovered.
    if (thread.messages.length === 0) continue;

    const existing = byId.get(thread.id);
    if (!existing) {
      byId.set(thread.id, thread);
      importedCount += 1;
      continue;
    }

    const picked = pickRicherThread(existing, thread);
    if (picked !== existing) {
      byId.set(thread.id, picked);
      updatedCount += 1;
    }
  }

  const threads = sortThreads([...byId.values()]);
  let workingDirectory = current.workingDirectory;
  if (!workingDirectory.trim() && imported.workingDirectory.trim()) {
    workingDirectory = imported.workingDirectory;
  }

  let activeThreadId = current.activeThreadId;
  const active = byId.get(activeThreadId);
  if (active && isThreadEmpty(active)) {
    const firstWithContent = threads.find((t) => t.messages.length > 0);
    if (firstWithContent) activeThreadId = firstWithContent.id;
  }

  // Imported threads join sidebar history; do not merge legacy openTabIds into the strip.
  const activeSwitchedFromEmpty =
    active !== undefined
    && isThreadEmpty(active)
    && activeThreadId !== current.activeThreadId;

  let openTabIds: string[];
  if (activeSwitchedFromEmpty) {
    openTabIds = [activeThreadId];
  } else {
    openTabIds = current.openTabIds.filter((id) => byId.has(id));
    if (!openTabIds.includes(activeThreadId)) {
      const pivot = openTabIds.indexOf(current.activeThreadId);
      if (pivot >= 0) {
        openTabIds = [
          ...openTabIds.slice(0, pivot + 1),
          activeThreadId,
          ...openTabIds.slice(pivot + 1),
        ];
      } else {
        openTabIds = [...openTabIds, activeThreadId];
      }
    }
    if (openTabIds.length === 0) {
      openTabIds = [activeThreadId];
    }
  }

  const store = normalizeLoadedStore({
    ...current,
    threads,
    activeThreadId,
    openTabIds,
    workingDirectory,
  });

  return { store, importedCount, updatedCount };
}

function collectChunkedLocalStorageCandidates(): Array<{ source: string; data: ChatStoreData }> {
  const out: Array<{ source: string; data: ChatStoreData }> = [];

  try {
    const chunked = loadPersistedChatStore({ messageScope: "all" });
    if (chunked && chatStoreHasPersistedMessages(chunked)) {
      out.push({ source: "当前 localStorage（v3 分片）", data: chunked });
    }
  } catch {
    /* ignore */
  }

  try {
    const indexRaw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (indexRaw) {
      const index = tryParseV3Index(JSON.parse(indexRaw) as unknown);
      if (index) {
        const hydrated = assembleStoreFromV3Parts(index, (threadId) => {
          const primary = loadThreadMessagesFromStorage(threadId);
          if (primary.length > 0) return primary;
          return loadThreadMessagesFromStorage(threadId, { preferBackup: true });
        });
        if (
          chatStoreHasPersistedMessages(hydrated)
          && !out.some((item) => item.source === "当前 localStorage（v3 分片）")
        ) {
          out.push({ source: "当前 localStorage（v3 分片 + 备份线程）", data: hydrated });
        }
      }
    }
  } catch {
    /* ignore */
  }

  const indexedIds = new Set<string>();
  try {
    for (const key of [CHAT_STORAGE_KEY, CHAT_STORAGE_BACKUP_KEY]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const index = tryParseV3Index(JSON.parse(raw) as unknown);
      index?.threads.forEach((thread) => indexedIds.add(thread.id));
    }
  } catch {
    /* ignore */
  }

  const orphanThreads: ChatThread[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    if (
      key.startsWith(CHAT_THREAD_KEY_PREFIX)
      && !key.startsWith(CHAT_THREAD_BACKUP_KEY_PREFIX)
    ) {
      const threadId = key.slice(CHAT_THREAD_KEY_PREFIX.length);
      if (!threadId || indexedIds.has(threadId)) continue;
      const messages = loadThreadMessagesFromStorage(threadId);
      if (messages.length === 0) continue;
      orphanThreads.push({
        id: threadId,
        title: "恢复的对话",
        messages,
        updatedAt: now(),
        titleGenerated: false,
        titleManual: false,
      });
      continue;
    }

    if (key.startsWith(CHAT_THREAD_BACKUP_KEY_PREFIX)) {
      const threadId = key.slice(CHAT_THREAD_BACKUP_KEY_PREFIX.length);
      if (!threadId || indexedIds.has(threadId)) continue;
      if (orphanThreads.some((thread) => thread.id === threadId)) continue;
      const messages = loadThreadMessagesFromStorage(threadId, { preferBackup: true });
      if (messages.length === 0) continue;
      orphanThreads.push({
        id: threadId,
        title: "恢复的对话（备份）",
        messages,
        updatedAt: now(),
        titleGenerated: false,
        titleManual: false,
      });
    }
  }

  if (orphanThreads.length > 0) {
    const activeThreadId = orphanThreads[0]!.id;
    out.push({
      source: "孤立线程分片（localStorage）",
      data: compactEmptyThreads({
        ...defaultChatStore(),
        activeThreadId,
        openTabIds: [activeThreadId],
        threads: orphanThreads,
      }),
    });
  }

  return out;
}

function collectLegacyChatStoreCandidates(): Array<{ source: string; data: ChatStoreData }> {
  if (typeof window === "undefined") return [];

  const out: Array<{ source: string; data: ChatStoreData }> = [
    ...collectChunkedLocalStorageCandidates(),
  ];

  try {
    const legacyWs = localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY);
    if (legacyWs) {
      const migrated = migrateLegacyWorkspaceStore(JSON.parse(legacyWs) as unknown);
      if (migrated?.threads.some((t) => t.messages.length > 0)) {
        out.push({ source: "多工作区 (v1)", data: migrated });
      }
    }
  } catch {
    /* ignore corrupt legacy blob */
  }

  try {
    const chunkedBackup = loadPersistedChatStoreFromBackup();
    if (chunkedBackup?.threads.some((t) => t.messages.length > 0)) {
      out.push({ source: "自动备份", data: chunkedBackup });
    } else {
      const backupRaw = localStorage.getItem(CHAT_STORAGE_BACKUP_KEY);
      if (backupRaw) {
        const data = normalizeStore(JSON.parse(backupRaw) as Partial<ChatStoreData>);
        if (data.threads.some((t) => t.messages.length > 0)) {
          out.push({ source: "自动备份", data });
        }
      }
    }
  } catch {
    /* ignore corrupt backup blob */
  }

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      !key
      || key === CHAT_STORAGE_KEY
      || key === CHAT_STORAGE_BACKUP_KEY
      || key === LEGACY_WORKSPACE_STORAGE_KEY
      || key.startsWith(CHAT_THREAD_KEY_PREFIX)
    ) {
      continue;
    }
    if (!/^agent-gui-chats(?:[-._].+)?$/i.test(key)) continue;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = normalizeStore(JSON.parse(raw) as Partial<ChatStoreData>);
      if (data.threads.some((t) => t.messages.length > 0)) {
        out.push({ source: `localStorage · ${key}`, data });
      }
    } catch {
      /* skip invalid backup keys */
    }
  }

  return out;
}

/** Parse raw JSON extracted from a legacy storage key (localStorage or LevelDB). */
export function parseLegacyChatPayload(
  storageKey: string,
  raw: string,
): ChatStoreData | null {
  try {
    if (storageKey === LEGACY_WORKSPACE_STORAGE_KEY || storageKey.includes("workspaces")) {
      return migrateLegacyWorkspaceStore(JSON.parse(raw) as unknown);
    }
    const store = normalizeStore(JSON.parse(raw) as Partial<ChatStoreData>);
    if (!store.threads.some((t) => t.messages.length > 0)) return null;
    return store;
  } catch {
    return null;
  }
}

function dedupeLegacyCandidates(
  candidates: Array<{ source: string; data: ChatStoreData }>,
): Array<{ source: string; data: ChatStoreData }> {
  const out: Array<{ source: string; data: ChatStoreData }> = [];
  const seen = new Set<string>();

  for (const item of candidates) {
    const signature = item.data.threads
      .filter((t) => t.messages.length > 0)
      .map((t) => `${t.id}:${t.messages.length}`)
      .sort()
      .join("|");
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    out.push(item);
  }

  return out;
}

/** Merge legacy localStorage chat data (v1 workspaces, backup keys) into the current store. */
export function tryRestoreLegacyChatStore(
  current: ChatStoreData,
  externalCandidates: Array<{ source: string; data: ChatStoreData }> = [],
  scanMeta?: { scannedRoots?: string[] },
): {
  next: ChatStoreData;
  result: LegacyChatRestoreResult;
} {
  const candidates = dedupeLegacyCandidates([
    ...externalCandidates,
    ...collectLegacyChatStoreCandidates(),
  ]);
  if (candidates.length === 0) {
    const rootsHint = scanMeta?.scannedRoots?.length
      ? `\n\n已扫描目录：\n${scanMeta.scannedRoots.join("\n")}`
      : "";
    return {
      next: current,
      result: {
        ok: false,
        title: "未发现可恢复的数据",
        body:
          "未在当前 localStorage 或已知 WebView LevelDB 目录中找到含消息的 agent-gui-chats / agent-gui-chats-thread-* / agent-gui-workspaces。"
          + " 旧版可能使用不同浏览器 profile（如 pnpm dev 的 Chrome）或不同 http://127.0.0.1:端口 origin；"
          + " 请在曾使用过的环境重试，或从 DevTools 复制 agent-gui-chats JSON 手动导入。"
          + rootsHint,
        sources: [],
        importedThreadCount: 0,
        updatedThreadCount: 0,
      },
    };
  }

  let next = current;
  let importedTotal = 0;
  let updatedTotal = 0;
  const sources: string[] = [];

  for (const { source, data } of candidates) {
    const { store, importedCount, updatedCount } = mergeChatStoreFromLegacy(next, data);
    next = store;
    importedTotal += importedCount;
    updatedTotal += updatedCount;
    if (importedCount > 0 || updatedCount > 0) sources.push(source);
  }

  const changed = importedTotal > 0 || updatedTotal > 0;
  if (changed) {
    try {
      localStorage.removeItem(LEGACY_WORKSPACE_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    next = normalizeLoadedStore(next);
    if (getChatStorePersistenceMode() !== "api") {
      saveChatStore(next);
    }
  }

  if (!changed) {
    return {
      next: current,
      result: {
        ok: false,
        title: "没有新对话可合并",
        body: `找到 ${candidates.length} 处旧数据，但与当前列表相同或均为空。`,
        sources: candidates.map((c) => c.source),
        importedThreadCount: 0,
        updatedThreadCount: 0,
      },
    };
  }

  const parts: string[] = [];
  if (importedTotal > 0) parts.push(`新增 ${importedTotal} 个对话`);
  if (updatedTotal > 0) parts.push(`更新 ${updatedTotal} 个对话`);

  return {
    next,
    result: {
      ok: true,
      title: "恢复完成",
      body: `${parts.join("，")}。（来源：${sources.join("、")}）`,
      sources,
      importedThreadCount: importedTotal,
      updatedThreadCount: updatedTotal,
    },
  };
}
