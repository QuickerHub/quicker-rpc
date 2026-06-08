import type { AgentUIMessage } from "@/lib/chat-types";
import type { ChatStoreData, ChatThread } from "@/lib/chat-store";

export const CHAT_STORAGE_KEY = "agent-gui-chats";
export const CHAT_STORAGE_BACKUP_KEY = "agent-gui-chats-backup";
export const CHAT_STORE_VERSION = 3;
function threadMessagesEqual(
  a: AgentUIMessage[],
  b: AgentUIMessage[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export const CHAT_THREAD_BLOB_VERSION = 1;
export const CHAT_THREAD_KEY_PREFIX = "agent-gui-chats-thread-";
export const CHAT_THREAD_BACKUP_KEY_PREFIX = "agent-gui-chats-backup-thread-";

export type ChatThreadMeta = Omit<ChatThread, "messages">;

export type ChatStoreIndex = {
  version: typeof CHAT_STORE_VERSION;
  activeThreadId: string;
  threads: ChatThreadMeta[];
  openTabIds: string[];
  tabStripPersisted?: boolean;
  workingDirectory: string;
};

type ChatThreadMessagesBlob = {
  version: typeof CHAT_THREAD_BLOB_VERSION;
  threadId: string;
  messages: AgentUIMessage[];
};

export type ChatLoadMessageScope = "none" | "active" | "all";

export function threadStorageKey(threadId: string): string {
  return `${CHAT_THREAD_KEY_PREFIX}${threadId}`;
}

export function threadBackupStorageKey(threadId: string): string {
  return `${CHAT_THREAD_BACKUP_KEY_PREFIX}${threadId}`;
}

export function isThreadStorageKey(key: string): boolean {
  return key.startsWith(CHAT_THREAD_KEY_PREFIX)
    && !key.startsWith(CHAT_THREAD_BACKUP_KEY_PREFIX);
}

export function isThreadBackupStorageKey(key: string): boolean {
  return key.startsWith(CHAT_THREAD_BACKUP_KEY_PREFIX);
}

function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota errors */
  }
}

function removeLocalStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function normalizeThreadMeta(raw: unknown): ChatThreadMeta | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Partial<ChatThreadMeta & { messages?: unknown }>;
  if (typeof item.id !== "string" || typeof item.title !== "string") return null;
  return {
    id: item.id,
    title: item.title,
    updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
    titleGenerated: item.titleGenerated === true,
    titleManual: item.titleManual === true,
  };
}

export function parseThreadMessagesFromLegacyJson(
  raw: string,
  threadId?: string,
): AgentUIMessage[] {
  if (!threadId) {
    try {
      const parsed = JSON.parse(raw) as Partial<ChatThreadMessagesBlob>;
      if (typeof parsed.threadId === "string") {
        return parseThreadMessagesBlob(raw, parsed.threadId);
      }
    } catch {
      /* ignore */
    }
    return [];
  }
  return parseThreadMessagesBlob(raw, threadId);
}

function parseThreadMessagesBlob(raw: string, threadId: string): AgentUIMessage[] {
  try {
    const parsed = JSON.parse(raw) as Partial<ChatThreadMessagesBlob> | AgentUIMessage[];
    if (Array.isArray(parsed)) {
      return parsed as AgentUIMessage[];
    }
    if (
      parsed.version === CHAT_THREAD_BLOB_VERSION
      && parsed.threadId === threadId
      && Array.isArray(parsed.messages)
    ) {
      return parsed.messages as AgentUIMessage[];
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function loadThreadMessagesFromStorage(
  threadId: string,
  options?: { preferBackup?: boolean },
): AgentUIMessage[] {
  if (options?.preferBackup) {
    const backup = restoreThreadMessagesFromBackup(threadId);
    if (backup.length > 0) return backup;
  }
  const raw = readLocalStorage(threadStorageKey(threadId));
  if (!raw) return [];
  return parseThreadMessagesBlob(raw, threadId);
}

function writeThreadMessagesToStorage(threadId: string, messages: AgentUIMessage[]): void {
  const blob: ChatThreadMessagesBlob = {
    version: CHAT_THREAD_BLOB_VERSION,
    threadId,
    messages,
  };
  writeLocalStorage(threadStorageKey(threadId), JSON.stringify(blob));
}

function backupThreadMessagesToStorage(threadId: string): void {
  const raw = readLocalStorage(threadStorageKey(threadId));
  if (!raw) return;
  writeLocalStorage(threadBackupStorageKey(threadId), raw);
}

function restoreThreadMessagesFromBackup(threadId: string): AgentUIMessage[] {
  const raw = readLocalStorage(threadBackupStorageKey(threadId));
  if (!raw) return [];
  return parseThreadMessagesBlob(raw, threadId);
}

export function toChatStoreIndex(data: ChatStoreData): ChatStoreIndex {
  return {
    version: CHAT_STORE_VERSION,
    activeThreadId: data.activeThreadId,
    threads: data.threads.map(({ messages: _messages, ...meta }) => meta),
    openTabIds: data.openTabIds,
    tabStripPersisted: data.tabStripPersisted,
    workingDirectory: data.workingDirectory,
  };
}

function assembleStoreFromIndex(
  index: ChatStoreIndex,
  messageScope: ChatLoadMessageScope,
): ChatStoreData {
  const loadForThread = (threadId: string): AgentUIMessage[] => {
    if (messageScope === "none") return [];
    if (messageScope === "active" && threadId !== index.activeThreadId) {
      return [];
    }
    return loadThreadMessagesFromStorage(threadId);
  };

  const threads: ChatThread[] = index.threads.map((meta) => ({
    ...meta,
    messages: loadForThread(meta.id),
  }));

  return {
    version: CHAT_STORE_VERSION,
    activeThreadId: index.activeThreadId,
    threads,
    openTabIds: index.openTabIds,
    tabStripPersisted: index.tabStripPersisted,
    workingDirectory: index.workingDirectory,
  };
}

export function tryParseV3Index(raw: unknown): ChatStoreIndex | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Partial<ChatStoreIndex>;
  if (data.version !== CHAT_STORE_VERSION || !Array.isArray(data.threads)) {
    return null;
  }

  const threads = data.threads
    .map((item) => normalizeThreadMeta(item))
    .filter((item): item is ChatThreadMeta => item !== null);
  if (threads.length === 0) return null;

  const activeThreadId =
    typeof data.activeThreadId === "string"
    && threads.some((thread) => thread.id === data.activeThreadId)
      ? data.activeThreadId
      : threads[0]!.id;

  const threadIds = new Set(threads.map((thread) => thread.id));
  let openTabIds = Array.isArray(data.openTabIds)
    ? data.openTabIds.filter((id): id is string => typeof id === "string" && threadIds.has(id))
    : [];
  if (openTabIds.length === 0) {
    openTabIds = [activeThreadId];
  }

  return {
    version: CHAT_STORE_VERSION,
    activeThreadId,
    threads,
    openTabIds,
    tabStripPersisted: data.tabStripPersisted === true,
    workingDirectory:
      typeof data.workingDirectory === "string" ? data.workingDirectory : "",
  };
}

/** Migrate monolithic v2 blob to v3 index + per-thread message keys. */
export function migrateMonolithicStoreToChunked(data: ChatStoreData): ChatStoreData {
  writeLocalStorage(CHAT_STORAGE_KEY, JSON.stringify(toChatStoreIndex(data)));
  for (const thread of data.threads) {
    writeThreadMessagesToStorage(thread.id, thread.messages);
  }
  lastPersistedSnapshot = data;
  return data;
}

let lastPersistedSnapshot: ChatStoreData | null = null;

export function getLastPersistedSnapshot(): ChatStoreData | null {
  return lastPersistedSnapshot;
}

export function resetPersistedSnapshotForTests(): void {
  lastPersistedSnapshot = null;
}

function indexMetadataChanged(prev: ChatStoreData, next: ChatStoreData): boolean {
  if (prev.activeThreadId !== next.activeThreadId) return true;
  if (prev.workingDirectory !== next.workingDirectory) return true;
  if (prev.tabStripPersisted !== next.tabStripPersisted) return true;
  if (prev.openTabIds.length !== next.openTabIds.length) return true;
  if (prev.openTabIds.some((id, index) => id !== next.openTabIds[index])) return true;
  if (prev.threads.length !== next.threads.length) return true;

  for (const thread of next.threads) {
    const previous = prev.threads.find((item) => item.id === thread.id);
    if (!previous) return true;
    if (previous.title !== thread.title) return true;
    if (previous.updatedAt !== thread.updatedAt) return true;
    if (previous.titleGenerated !== thread.titleGenerated) return true;
    if (previous.titleManual !== thread.titleManual) return true;
  }

  for (const thread of prev.threads) {
    if (!next.threads.some((item) => item.id === thread.id)) return true;
  }

  return false;
}

function collectDirtyThreadIds(prev: ChatStoreData, next: ChatStoreData): Set<string> {
  const dirty = new Set<string>();
  const nextIds = new Set(next.threads.map((thread) => thread.id));

  for (const thread of prev.threads) {
    if (!nextIds.has(thread.id)) {
      dirty.add(thread.id);
    }
  }

  for (const thread of next.threads) {
    const previous = prev.threads.find((item) => item.id === thread.id);
    if (!previous || !threadMessagesEqual(previous.messages, thread.messages)) {
      dirty.add(thread.id);
    }
  }

  return dirty;
}

function maybeBackupThreadBeforeWrite(
  threadId: string,
  prevMessages: AgentUIMessage[],
  nextMessages: AgentUIMessage[],
): void {
  if (prevMessages.length === 0) return;
  if (nextMessages.length > 0) return;
  backupThreadMessagesToStorage(threadId);
}

export function savePersistedChatStore(
  data: ChatStoreData,
  options?: { previous?: ChatStoreData | null },
): void {
  if (typeof window === "undefined") return;

  const previous = options?.previous ?? lastPersistedSnapshot;
  if (previous) {
    const dirtyThreadIds = collectDirtyThreadIds(previous, data);
    for (const threadId of dirtyThreadIds) {
      const prevThread = previous.threads.find((thread) => thread.id === threadId);
      const nextThread = data.threads.find((thread) => thread.id === threadId);
      if (prevThread && nextThread) {
        maybeBackupThreadBeforeWrite(
          threadId,
          prevThread.messages,
          nextThread.messages,
        );
      } else if (prevThread && !nextThread && prevThread.messages.length > 0) {
        backupThreadMessagesToStorage(threadId);
      }
    }
  }

  if (!previous || indexMetadataChanged(previous, data)) {
    writeLocalStorage(CHAT_STORAGE_KEY, JSON.stringify(toChatStoreIndex(data)));
  }

  if (previous) {
    const dirtyThreadIds = collectDirtyThreadIds(previous, data);
    const nextIds = new Set(data.threads.map((thread) => thread.id));

    for (const threadId of dirtyThreadIds) {
      if (!nextIds.has(threadId)) {
        removeLocalStorage(threadStorageKey(threadId));
        continue;
      }
      const thread = data.threads.find((item) => item.id === threadId);
      if (thread) {
        writeThreadMessagesToStorage(thread.id, thread.messages);
      }
    }
  } else {
    for (const thread of data.threads) {
      writeThreadMessagesToStorage(thread.id, thread.messages);
    }
  }

  lastPersistedSnapshot = data;
}

export function loadPersistedChatStore(
  options: { messageScope?: ChatLoadMessageScope } = {},
): ChatStoreData | null {
  const messageScope = options.messageScope ?? "active";
  const indexRaw = readLocalStorage(CHAT_STORAGE_KEY);
  if (!indexRaw) return null;

  try {
    const parsed = JSON.parse(indexRaw) as unknown;
    const index = tryParseV3Index(parsed);
    if (!index) return null;
    const store = assembleStoreFromIndex(index, messageScope);
    if (messageScope === "all") {
      lastPersistedSnapshot = store;
    } else if (messageScope === "active") {
      lastPersistedSnapshot = assembleStoreFromIndex(index, "none");
      for (const thread of store.threads) {
        if (thread.messages.length > 0) {
          const persisted = lastPersistedSnapshot.threads.find(
            (item) => item.id === thread.id,
          );
          if (persisted) persisted.messages = thread.messages;
        }
      }
    }
    return store;
  } catch {
    return null;
  }
}

export function hydrateStoreThreadMessages(
  store: ChatStoreData,
  threadId: string,
): ChatStoreData {
  const thread = store.threads.find((item) => item.id === threadId);
  if (!thread || thread.messages.length > 0) {
    return store;
  }

  const messages = loadThreadMessagesFromStorage(threadId);
  if (messages.length === 0) {
    return store;
  }

  const next: ChatStoreData = {
    ...store,
    threads: store.threads.map((item) =>
      item.id === threadId ? { ...item, messages } : item,
    ),
  };

  if (lastPersistedSnapshot) {
    const persisted = lastPersistedSnapshot.threads.find((item) => item.id === threadId);
    if (persisted) {
      persisted.messages = messages;
    }
  }

  return next;
}

export function loadPersistedChatStoreFromBackup(): ChatStoreData | null {
  const indexRaw = readLocalStorage(CHAT_STORAGE_BACKUP_KEY);
  if (!indexRaw) return null;

  try {
    const parsed = JSON.parse(indexRaw) as unknown;

    const v3Index = tryParseV3Index(parsed);
    if (v3Index) {
      const threads: ChatThread[] = v3Index.threads.map((meta) => ({
        ...meta,
        messages: restoreThreadMessagesFromBackup(meta.id),
      }));
      return {
        version: CHAT_STORE_VERSION,
        activeThreadId: v3Index.activeThreadId,
        threads,
        openTabIds: v3Index.openTabIds,
        tabStripPersisted: v3Index.tabStripPersisted,
        workingDirectory: v3Index.workingDirectory,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function backupPersistedChatStoreIndex(index: ChatStoreIndex): void {
  writeLocalStorage(CHAT_STORAGE_BACKUP_KEY, JSON.stringify(index));
}

export function assembleStoreFromV3Parts(
  index: ChatStoreIndex,
  readMessages: (threadId: string) => AgentUIMessage[],
): ChatStoreData {
  return {
    version: CHAT_STORE_VERSION,
    activeThreadId: index.activeThreadId,
    openTabIds: index.openTabIds,
    tabStripPersisted: index.tabStripPersisted,
    workingDirectory: index.workingDirectory,
    threads: index.threads.map((meta) => ({
      ...meta,
      messages: readMessages(meta.id),
    })),
  };
}
