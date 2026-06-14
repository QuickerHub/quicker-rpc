import { asc, count, desc, eq, inArray } from "drizzle-orm";
import type { ActionDesignerThreadRef } from "@/lib/action-designer-thread";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  normalizeLoadedStore,
  type ChatStoreData,
  type ChatThread,
} from "@/lib/chat-store";
import { chatMessagesEqual } from "@/lib/chat-message-signature";
import {
  CHAT_STORE_VERSION,
  type ChatLoadMessageScope,
  type ChatStoreIndex,
  toChatStoreIndex,
  tryParseV3Index,
} from "@/lib/chat-store-persist";
import {
  CHAT_META_SINGLETON_ID,
  chatMeta,
  chatThreadMessages,
  chatThreadMessagesBackup,
  chatThreads,
} from "@/lib/db/schema";
import { getChatDatabase, type ChatDatabase } from "@/lib/db/client";
import {
  assertSavePreservesPersistedMessages,
  ChatStoreSaveWouldWipeError,
} from "@/lib/db/save-guard";

export { ChatStoreSaveWouldWipeError };

let lastPersistedSnapshot: ChatStoreData | null = null;

function parseMessagesJson(raw: string, threadId: string): AgentUIMessage[] {
  try {
    const parsed = JSON.parse(raw) as
      | { version?: number; threadId?: string; messages?: unknown }
      | AgentUIMessage[];
    if (Array.isArray(parsed)) return parsed;
    if (parsed.version === 1 && parsed.threadId === threadId && Array.isArray(parsed.messages)) {
      return parsed.messages as AgentUIMessage[];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function serializeMessagesBlob(threadId: string, messages: AgentUIMessage[]): string {
  return JSON.stringify({
    version: 1,
    threadId,
    messages,
  });
}

function actionDesignerFromRow(
  entityId: string | null | undefined,
  isSubProgram: number | null | undefined,
): ActionDesignerThreadRef | undefined {
  const id = entityId?.trim() ?? "";
  if (!id) return undefined;
  return { entityId: id, isSubProgram: isSubProgram === 1 };
}

function actionDesignerToRow(ref: ActionDesignerThreadRef | undefined): {
  actionDesignerEntityId: string | null;
  actionDesignerIsSubProgram: number | null;
} {
  const entityId = ref?.entityId?.trim() ?? "";
  if (!entityId) {
    return { actionDesignerEntityId: null, actionDesignerIsSubProgram: null };
  }
  return {
    actionDesignerEntityId: entityId,
    actionDesignerIsSubProgram: ref?.isSubProgram === true ? 1 : 0,
  };
}

function rowToThreadMeta(row: {
  id: string;
  title: string;
  updatedAt: number;
  titleGenerated: number;
  titleManual: number;
  messageCount: number | null;
  workspaceId: string | null;
  workingDirectory: string | null;
  actionDesignerEntityId: string | null;
  actionDesignerIsSubProgram: number | null;
}): Omit<ChatThread, "messages"> {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt,
    titleGenerated: row.titleGenerated === 1,
    titleManual: row.titleManual === 1,
    messageCount: row.messageCount === null ? undefined : row.messageCount,
    workspaceId: row.workspaceId ?? undefined,
    workingDirectory: row.workingDirectory ?? undefined,
    actionDesigner: actionDesignerFromRow(
      row.actionDesignerEntityId,
      row.actionDesignerIsSubProgram,
    ),
  };
}

function readBackupThreadMessages(
  db: ChatDatabase,
  threadId: string,
): AgentUIMessage[] {
  const [backup] = db
    .select()
    .from(chatThreadMessagesBackup)
    .where(eq(chatThreadMessagesBackup.threadId, threadId))
    .limit(1)
    .all();
  if (!backup?.messagesJson) return [];
  return parseMessagesJson(backup.messagesJson, threadId);
}

function readThreadMessages(
  threadId: string,
  options?: { preferBackup?: boolean },
): AgentUIMessage[] {
  const db = getChatDatabase();

  if (options?.preferBackup) {
    const fromBackup = readBackupThreadMessages(db, threadId);
    if (fromBackup.length > 0) return fromBackup;
  }

  const [row] = db
    .select()
    .from(chatThreadMessages)
    .where(eq(chatThreadMessages.threadId, threadId))
    .limit(1)
    .all();
  if (row?.messagesJson) {
    const messages = parseMessagesJson(row.messagesJson, threadId);
    if (messages.length > 0) return messages;
  }

  // Primary blob missing/empty while backup still holds the last good snapshot.
  return readBackupThreadMessages(db, threadId);
}

function loadIndexFromDb(): ChatStoreIndex | null {
  const db = getChatDatabase();

  const [meta] = db
    .select()
    .from(chatMeta)
    .where(eq(chatMeta.id, CHAT_META_SINGLETON_ID))
    .limit(1)
    .all();

  if (!meta || meta.version !== CHAT_STORE_VERSION) return null;

  const threadRows = db
    .select()
    .from(chatThreads)
    .orderBy(asc(chatThreads.sortIndex), desc(chatThreads.updatedAt))
    .all();

  const threads = threadRows.map(rowToThreadMeta);
  if (threads.length === 0) return null;

  let openTabIds: string[] = [];
  try {
    const parsed = JSON.parse(meta.openTabIdsJson) as unknown;
    if (Array.isArray(parsed)) {
      const ids = new Set(threads.map((t) => t.id));
      openTabIds = parsed.filter((id): id is string => typeof id === "string" && ids.has(id));
    }
  } catch {
    /* ignore */
  }

  let workspaces: ChatStoreIndex["workspaces"] = [];
  try {
    const parsed = JSON.parse(meta.workspacesJson ?? "[]") as unknown;
    if (Array.isArray(parsed)) {
      workspaces = parsed.filter(
        (ws): ws is NonNullable<ChatStoreIndex["workspaces"]>[number] =>
          typeof ws === "object"
          && ws !== null
          && typeof (ws as { id?: string }).id === "string"
          && typeof (ws as { rootPath?: string }).rootPath === "string",
      );
    }
  } catch {
    /* ignore */
  }

  return tryParseV3Index({
    version: CHAT_STORE_VERSION,
    activeThreadId: meta.activeThreadId,
    activeWorkspaceId: meta.activeWorkspaceId ?? "",
    workspaces,
    openTabIds,
    tabStripPersisted: meta.tabStripPersisted === 1,
    workingDirectory: meta.workingDirectory,
    threads,
  });
}

function assembleStore(
  index: ChatStoreIndex,
  messageScope: ChatLoadMessageScope,
): ChatStoreData {
  const threads: ChatThread[] = index.threads.map((meta) => {
    let messages: AgentUIMessage[] = [];
    if (messageScope === "all") {
      messages = readThreadMessages(meta.id);
    } else if (messageScope === "active" && meta.id === index.activeThreadId) {
      messages = readThreadMessages(meta.id);
    }
    return { ...meta, messages };
  });

  return {
    version: CHAT_STORE_VERSION,
    activeThreadId: index.activeThreadId,
    activeWorkspaceId: index.activeWorkspaceId ?? "",
    workspaces: index.workspaces ?? [],
    threads,
    openTabIds: index.openTabIds,
    tabStripPersisted: index.tabStripPersisted,
    workingDirectory: index.workingDirectory,
  };
}

export function chatDatabaseHasThreads(): boolean {
  const db = getChatDatabase();
  const [row] = db.select({ c: count() }).from(chatThreads).all();
  return (row?.c ?? 0) > 0;
}

export function chatDatabaseHasPersistedMessages(): boolean {
  return countPersistedMessagesInDatabase() > 0;
}

export function countPersistedMessagesInDatabase(): number {
  const db = getChatDatabase();
  const [row] = db.select({ c: count() }).from(chatThreadMessages).all();
  return row?.c ?? 0;
}

function resolvePreviousSnapshot(
  explicit: ChatStoreData | null | undefined,
): ChatStoreData | null {
  if (explicit) return explicit;
  if (lastPersistedSnapshot) return lastPersistedSnapshot;
  return loadChatStoreFromDatabase({ messageScope: "none" });
}

export function loadChatStoreFromDatabase(
  options: { messageScope?: ChatLoadMessageScope } = {},
): ChatStoreData | null {
  const messageScope = options.messageScope ?? "active";
  const index = loadIndexFromDb();
  if (!index) return null;

  const store = assembleStore(index, messageScope);
  if (messageScope === "all") {
    lastPersistedSnapshot = normalizeLoadedStore(store);
  } else if (messageScope === "active") {
    lastPersistedSnapshot = normalizeLoadedStore(assembleStore(index, "none"));
    for (const thread of store.threads) {
      if (thread.messages.length > 0) {
        const persisted = lastPersistedSnapshot.threads.find((item) => item.id === thread.id);
        if (persisted) {
          persisted.messages = thread.messages;
          persisted.messageCount = thread.messages.length;
        }
      }
    }
  }
  return store ? normalizeLoadedStore(store) : null;
}

export function loadThreadMessagesFromDatabase(
  threadId: string,
  options?: { preferBackup?: boolean },
): AgentUIMessage[] {
  return readThreadMessages(threadId, options);
}

function threadMessagesEqual(a: AgentUIMessage[], b: AgentUIMessage[]): boolean {
  return chatMessagesEqual(a, b);
}

function indexMetadataChanged(prev: ChatStoreData, next: ChatStoreData): boolean {
  if (prev.activeThreadId !== next.activeThreadId) return true;
  if (prev.activeWorkspaceId !== next.activeWorkspaceId) return true;
  if (prev.workingDirectory !== next.workingDirectory) return true;
  if (prev.workspaces.length !== next.workspaces.length) return true;
  for (const ws of next.workspaces) {
    const previous = prev.workspaces.find((item) => item.id === ws.id);
    if (!previous) return true;
    if (previous.rootPath !== ws.rootPath) return true;
    if (previous.label !== ws.label) return true;
  }
  for (const ws of prev.workspaces) {
    if (!next.workspaces.some((item) => item.id === ws.id)) return true;
  }
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
    if (previous.workspaceId !== thread.workspaceId) return true;
    if (previous.workingDirectory !== thread.workingDirectory) return true;
    if (
      previous.actionDesigner?.entityId !== thread.actionDesigner?.entityId
      || previous.actionDesigner?.isSubProgram !== thread.actionDesigner?.isSubProgram
    ) {
      return true;
    }
    const nextCount =
      thread.messages.length > 0 ? thread.messages.length : thread.messageCount;
    const prevCount =
      previous.messages.length > 0 ? previous.messages.length : previous.messageCount;
    if (nextCount !== prevCount) return true;
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
    if (!nextIds.has(thread.id)) dirty.add(thread.id);
  }

  for (const thread of next.threads) {
    const previous = prev.threads.find((item) => item.id === thread.id);
    if (!previous || !threadMessagesEqual(previous.messages, thread.messages)) {
      dirty.add(thread.id);
    }
  }

  return dirty;
}

function backupThreadMessages(db: ChatDatabase, threadId: string): void {
  const [row] = db
    .select()
    .from(chatThreadMessages)
    .where(eq(chatThreadMessages.threadId, threadId))
    .limit(1)
    .all();
  if (!row?.messagesJson) return;

  db.insert(chatThreadMessagesBackup)
    .values({
      threadId,
      messagesJson: row.messagesJson,
      updatedAt: row.updatedAt ?? Date.now(),
    })
    .onConflictDoUpdate({
      target: chatThreadMessagesBackup.threadId,
      set: {
        messagesJson: row.messagesJson,
        updatedAt: row.updatedAt ?? Date.now(),
      },
    })
    .run();
}

function upsertMeta(db: ChatDatabase, data: ChatStoreData): void {
  db.insert(chatMeta)
    .values({
      id: CHAT_META_SINGLETON_ID,
      version: CHAT_STORE_VERSION,
      activeThreadId: data.activeThreadId,
      openTabIdsJson: JSON.stringify(data.openTabIds),
      tabStripPersisted: data.tabStripPersisted === true ? 1 : 0,
      workingDirectory: data.workingDirectory,
      activeWorkspaceId: data.activeWorkspaceId,
      workspacesJson: JSON.stringify(data.workspaces),
    })
    .onConflictDoUpdate({
      target: chatMeta.id,
      set: {
        version: CHAT_STORE_VERSION,
        activeThreadId: data.activeThreadId,
        openTabIdsJson: JSON.stringify(data.openTabIds),
        tabStripPersisted: data.tabStripPersisted === true ? 1 : 0,
        workingDirectory: data.workingDirectory,
        activeWorkspaceId: data.activeWorkspaceId,
        workspacesJson: JSON.stringify(data.workspaces),
      },
    })
    .run();
}

function upsertThread(
  db: ChatDatabase,
  thread: ChatThread,
  sortIndex: number,
): void {
  const messageCount =
    thread.messages.length > 0 ? thread.messages.length : thread.messageCount;
  const designerRow = actionDesignerToRow(thread.actionDesigner);

  db.insert(chatThreads)
    .values({
      id: thread.id,
      title: thread.title,
      updatedAt: thread.updatedAt,
      titleGenerated: thread.titleGenerated === true ? 1 : 0,
      titleManual: thread.titleManual === true ? 1 : 0,
      messageCount: messageCount ?? null,
      sortIndex,
      workspaceId: thread.workspaceId ?? null,
      workingDirectory: thread.workingDirectory?.trim() ?? "",
      ...designerRow,
    })
    .onConflictDoUpdate({
      target: chatThreads.id,
      set: {
        title: thread.title,
        updatedAt: thread.updatedAt,
        titleGenerated: thread.titleGenerated === true ? 1 : 0,
        titleManual: thread.titleManual === true ? 1 : 0,
        messageCount: messageCount ?? null,
        sortIndex,
        workspaceId: thread.workspaceId ?? null,
        workingDirectory: thread.workingDirectory?.trim() ?? "",
        ...designerRow,
      },
    })
    .run();
}

function upsertThreadMessages(
  db: ChatDatabase,
  threadId: string,
  messages: AgentUIMessage[],
  updatedAt: number,
): void {
  const messagesJson = serializeMessagesBlob(threadId, messages);
  db.insert(chatThreadMessages)
    .values({
      threadId,
      messagesJson,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: chatThreadMessages.threadId,
      set: {
        messagesJson,
        updatedAt,
      },
    })
    .run();
}

function deleteThreadsNotIn(db: ChatDatabase, keepIds: Set<string>): void {
  const existing = db.select({ id: chatThreads.id }).from(chatThreads).all();
  const removeIds = existing.map((row) => row.id).filter((id) => !keepIds.has(id));
  if (removeIds.length === 0) return;

  for (const id of removeIds) {
    backupThreadMessages(db, id);
  }
  db.delete(chatThreads).where(inArray(chatThreads.id, removeIds)).run();
}

export function saveChatStoreToDatabase(
  data: ChatStoreData,
  options?: { previous?: ChatStoreData | null; allowWipe?: boolean },
): void {
  const db = getChatDatabase();
  const previous = resolvePreviousSnapshot(options?.previous);
  const dbMessageTotal = countPersistedMessagesInDatabase();

  if (!options?.allowWipe) {
    assertSavePreservesPersistedMessages(previous, data, {
      dbPersistedMessageTotal: dbMessageTotal,
    });
  }

  const dirtyThreadIds = previous ? collectDirtyThreadIds(previous, data) : new Set<string>();
  const ts = Date.now();

  if (previous) {
    for (const threadId of dirtyThreadIds) {
      const prevThread = previous.threads.find((thread) => thread.id === threadId);
      const nextThread = data.threads.find((thread) => thread.id === threadId);
      if (prevThread && nextThread) {
        if (prevThread.messages.length > 0 && nextThread.messages.length === 0) {
          backupThreadMessages(db, threadId);
        }
      } else if (prevThread && !nextThread && prevThread.messages.length > 0) {
        backupThreadMessages(db, threadId);
      }
    }
  }

  db.transaction((tx) => {
    if (!previous || indexMetadataChanged(previous, data)) {
      upsertMeta(tx, data);

      const keepIds = new Set(data.threads.map((t) => t.id));
      deleteThreadsNotIn(tx, keepIds);

      data.threads.forEach((thread, sortIndex) => {
        upsertThread(tx, thread, sortIndex);
      });
    }

    const nextIds = new Set(data.threads.map((thread) => thread.id));

    if (previous && dirtyThreadIds.size > 0) {
      for (const threadId of dirtyThreadIds) {
        if (!nextIds.has(threadId)) continue;
        const thread = data.threads.find((item) => item.id === threadId);
        if (!thread) continue;
        if (thread.messages.length === 0 && thread.messageCount !== 0) continue;
        upsertThreadMessages(tx, threadId, thread.messages, ts);
      }
    } else if (!previous) {
      for (const thread of data.threads) {
        if (thread.messages.length === 0) continue;
        upsertThreadMessages(tx, thread.id, thread.messages, ts);
      }
    }
  });

  lastPersistedSnapshot = normalizeLoadedStore(data);
}

/** Full import (localStorage migration / legacy restore). */
export function importChatStoreToDatabase(
  data: ChatStoreData,
  options?: { allowWipe?: boolean },
): void {
  if (!options?.allowWipe && chatDatabaseHasPersistedMessages()) {
    throw new ChatStoreSaveWouldWipeError(
      "import refused while database already has message blobs",
    );
  }
  const ts = Date.now();
  const db = getChatDatabase();

  db.transaction((tx) => {
    tx.delete(chatThreadMessages).run();
    tx.delete(chatThreads).run();
    tx.delete(chatMeta).run();

    tx.insert(chatMeta)
      .values({
        id: CHAT_META_SINGLETON_ID,
        version: CHAT_STORE_VERSION,
        activeThreadId: data.activeThreadId,
        openTabIdsJson: JSON.stringify(data.openTabIds),
        tabStripPersisted: data.tabStripPersisted === true ? 1 : 0,
        workingDirectory: data.workingDirectory,
        activeWorkspaceId: data.activeWorkspaceId,
        workspacesJson: JSON.stringify(data.workspaces),
      })
      .run();

    for (const [sortIndex, thread] of data.threads.entries()) {
      const messageCount =
        thread.messages.length > 0 ? thread.messages.length : thread.messageCount ?? 0;
      tx.insert(chatThreads)
        .values({
          id: thread.id,
          title: thread.title,
          updatedAt: thread.updatedAt,
          titleGenerated: thread.titleGenerated === true ? 1 : 0,
          titleManual: thread.titleManual === true ? 1 : 0,
          messageCount,
          sortIndex,
          workspaceId: thread.workspaceId ?? null,
          workingDirectory: thread.workingDirectory?.trim() ?? "",
          ...actionDesignerToRow(thread.actionDesigner),
        })
        .run();

      if (thread.messages.length > 0) {
        tx.insert(chatThreadMessages)
          .values({
            threadId: thread.id,
            messagesJson: serializeMessagesBlob(thread.id, thread.messages),
            updatedAt: ts,
          })
          .run();
      }
    }
  });

  lastPersistedSnapshot = normalizeLoadedStore(data);
}

/** Merge legacy restore payloads: upsert thread rows + message blobs without wiping DB. */
export function mergeImportedChatStoreIntoDatabase(incoming: ChatStoreData): number {
  const normalized = normalizeLoadedStore(incoming);
  const previous = loadChatStoreFromDatabase({ messageScope: "none" });

  if (!previous) {
    importChatStoreToDatabase(normalized, { allowWipe: true });
    return normalized.threads.filter((thread) => thread.messages.length > 0).length;
  }

  const byId = new Map(previous.threads.map((thread) => [thread.id, thread]));
  let written = 0;

  for (const thread of normalized.threads) {
    if (thread.messages.length === 0) continue;
    const existing = byId.get(thread.id);
    byId.set(thread.id, {
      ...(existing ?? thread),
      ...thread,
      messages: thread.messages,
      messageCount: thread.messages.length,
    });
    written += 1;
  }

  const mergedThreads = [...byId.values()].sort((a, b) => {
    const byTime = b.updatedAt - a.updatedAt;
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });

  const merged = normalizeLoadedStore({
    ...previous,
    activeThreadId: normalized.activeThreadId,
    activeWorkspaceId: normalized.activeWorkspaceId,
    workspaces:
      normalized.workspaces.length >= previous.workspaces.length
        ? normalized.workspaces
        : previous.workspaces,
    workingDirectory: normalized.workingDirectory || previous.workingDirectory,
    threads: mergedThreads,
    openTabIds: normalized.openTabIds.length > 0 ? normalized.openTabIds : previous.openTabIds,
  });

  saveChatStoreToDatabase(merged, { previous });
  return written;
}

export function getLastDatabasePersistedSnapshot(): ChatStoreData | null {
  return lastPersistedSnapshot;
}

export function resetDatabasePersistedSnapshotForTests(): void {
  lastPersistedSnapshot = null;
}
