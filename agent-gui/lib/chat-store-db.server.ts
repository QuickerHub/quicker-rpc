import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { ChatStoreData, ChatThread } from "@/lib/chat-store";
import { chatMessagesEqual } from "@/lib/chat-message-signature";
import { resolvePersistedDataFilePath } from "@/lib/quicker-agent-persisted-data";
import {
  CHAT_STORE_VERSION,
  type ChatLoadMessageScope,
  type ChatStoreIndex,
  toChatStoreIndex,
  tryParseV3Index,
} from "@/lib/chat-store-persist";

export const CHAT_DB_FILENAME = "chats.db";

let dbInstance: DatabaseSync | null = null;
let lastPersistedSnapshot: ChatStoreData | null = null;

export function resolveChatDatabasePath(): string {
  return resolvePersistedDataFilePath(CHAT_DB_FILENAME);
}

function openDatabase(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const path = resolveChatDatabasePath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  ensureSchema(db);
  dbInstance = db;
  return db;
}

/** @internal test helper */
export function resetChatDatabaseForTests(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  lastPersistedSnapshot = null;
}

/** @internal test helper */
export function openChatDatabaseAt(path: string): DatabaseSync {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  ensureSchema(db);
  dbInstance = db;
  return db;
}

function ensureSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      active_thread_id TEXT NOT NULL,
      open_tab_ids_json TEXT NOT NULL,
      tab_strip_persisted INTEGER,
      working_directory TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      title_generated INTEGER NOT NULL DEFAULT 0,
      title_manual INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER,
      sort_index INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chat_thread_messages (
      thread_id TEXT PRIMARY KEY REFERENCES chat_threads(id) ON DELETE CASCADE,
      messages_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_thread_messages_backup (
      thread_id TEXT PRIMARY KEY,
      messages_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

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

function readThreadMessages(
  db: DatabaseSync,
  threadId: string,
  options?: { preferBackup?: boolean },
): AgentUIMessage[] {
  if (options?.preferBackup) {
    const backup = db
      .prepare("SELECT messages_json FROM chat_thread_messages_backup WHERE thread_id = ?")
      .get(threadId) as { messages_json?: string } | undefined;
    if (backup?.messages_json) {
      const messages = parseMessagesJson(backup.messages_json, threadId);
      if (messages.length > 0) return messages;
    }
  }
  const row = db
    .prepare("SELECT messages_json FROM chat_thread_messages WHERE thread_id = ?")
    .get(threadId) as { messages_json?: string } | undefined;
  if (!row?.messages_json) return [];
  return parseMessagesJson(row.messages_json, threadId);
}

function rowToThreadMeta(row: {
  id: string;
  title: string;
  updated_at: number;
  title_generated: number;
  title_manual: number;
  message_count: number | null;
}): Omit<ChatThread, "messages"> {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    titleGenerated: row.title_generated === 1,
    titleManual: row.title_manual === 1,
    messageCount: row.message_count === null ? undefined : row.message_count,
  };
}

function loadIndexFromDb(db: DatabaseSync): ChatStoreIndex | null {
  const meta = db
    .prepare(
      `SELECT version, active_thread_id, open_tab_ids_json, tab_strip_persisted, working_directory
       FROM chat_meta WHERE id = 1`,
    )
    .get() as
    | {
        version: number;
        active_thread_id: string;
        open_tab_ids_json: string;
        tab_strip_persisted: number | null;
        working_directory: string;
      }
    | undefined;

  if (!meta || meta.version !== CHAT_STORE_VERSION) return null;

  const threadRows = db
    .prepare(
      `SELECT id, title, updated_at, title_generated, title_manual, message_count
       FROM chat_threads ORDER BY sort_index ASC, updated_at DESC`,
    )
    .all() as Array<{
    id: string;
    title: string;
    updated_at: number;
    title_generated: number;
    title_manual: number;
    message_count: number | null;
  }>;

  const threads = threadRows.map(rowToThreadMeta);
  if (threads.length === 0) return null;

  let openTabIds: string[] = [];
  try {
    const parsed = JSON.parse(meta.open_tab_ids_json) as unknown;
    if (Array.isArray(parsed)) {
      const ids = new Set(threads.map((t) => t.id));
      openTabIds = parsed.filter((id): id is string => typeof id === "string" && ids.has(id));
    }
  } catch {
    /* ignore */
  }

  return tryParseV3Index({
    version: CHAT_STORE_VERSION,
    activeThreadId: meta.active_thread_id,
    openTabIds,
    tabStripPersisted: meta.tab_strip_persisted === 1,
    workingDirectory: meta.working_directory,
    threads,
  });
}

function assembleStore(
  index: ChatStoreIndex,
  messageScope: ChatLoadMessageScope,
  db: DatabaseSync,
): ChatStoreData {
  const threads: ChatThread[] = index.threads.map((meta) => {
    let messages: AgentUIMessage[] = [];
    if (messageScope === "all") {
      messages = readThreadMessages(db, meta.id);
    } else if (messageScope === "active" && meta.id === index.activeThreadId) {
      messages = readThreadMessages(db, meta.id);
    }
    return { ...meta, messages };
  });

  return {
    version: CHAT_STORE_VERSION,
    activeThreadId: index.activeThreadId,
    threads,
    openTabIds: index.openTabIds,
    tabStripPersisted: index.tabStripPersisted,
    workingDirectory: index.workingDirectory,
  };
}

export function chatDatabaseHasThreads(): boolean {
  const db = openDatabase();
  const row = db.prepare("SELECT COUNT(*) AS c FROM chat_threads").get() as { c: number };
  return row.c > 0;
}

export function chatDatabaseHasPersistedMessages(): boolean {
  const db = openDatabase();
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM chat_thread_messages")
    .get() as { c: number };
  return row.c > 0;
}

export function loadChatStoreFromDatabase(
  options: { messageScope?: ChatLoadMessageScope } = {},
): ChatStoreData | null {
  const messageScope = options.messageScope ?? "active";
  const db = openDatabase();
  const index = loadIndexFromDb(db);
  if (!index) return null;

  const store = assembleStore(index, messageScope, db);
  if (messageScope === "all") {
    lastPersistedSnapshot = store;
  } else if (messageScope === "active") {
    lastPersistedSnapshot = assembleStore(index, "none", db);
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
  return store;
}

export function loadThreadMessagesFromDatabase(
  threadId: string,
  options?: { preferBackup?: boolean },
): AgentUIMessage[] {
  const db = openDatabase();
  return readThreadMessages(db, threadId, options);
}

function threadMessagesEqual(a: AgentUIMessage[], b: AgentUIMessage[]): boolean {
  return chatMessagesEqual(a, b);
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

function backupThreadMessages(db: DatabaseSync, threadId: string): void {
  const row = db
    .prepare("SELECT messages_json, updated_at FROM chat_thread_messages WHERE thread_id = ?")
    .get(threadId) as { messages_json?: string; updated_at?: number } | undefined;
  if (!row?.messages_json) return;
  db.prepare(
    `INSERT INTO chat_thread_messages_backup (thread_id, messages_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(thread_id) DO UPDATE SET
       messages_json = excluded.messages_json,
       updated_at = excluded.updated_at`,
  ).run(threadId, row.messages_json, row.updated_at ?? Date.now());
}

export function saveChatStoreToDatabase(
  data: ChatStoreData,
  options?: { previous?: ChatStoreData | null },
): void {
  const db = openDatabase();
  const previous = options?.previous ?? lastPersistedSnapshot;
  const index = toChatStoreIndex(data);
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

  db.exec("BEGIN IMMEDIATE");
  try {
    if (!previous || indexMetadataChanged(previous, data)) {
      db.prepare(
        `INSERT INTO chat_meta (id, version, active_thread_id, open_tab_ids_json, tab_strip_persisted, working_directory)
         VALUES (1, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           version = excluded.version,
           active_thread_id = excluded.active_thread_id,
           open_tab_ids_json = excluded.open_tab_ids_json,
           tab_strip_persisted = excluded.tab_strip_persisted,
           working_directory = excluded.working_directory`,
      ).run(
        CHAT_STORE_VERSION,
        data.activeThreadId,
        JSON.stringify(data.openTabIds),
        data.tabStripPersisted === true ? 1 : 0,
        data.workingDirectory,
      );

      const keepIds = new Set(data.threads.map((t) => t.id));
      const existingIds = (
        db.prepare("SELECT id FROM chat_threads").all() as Array<{ id: string }>
      ).map((row) => row.id);
      for (const id of existingIds) {
        if (!keepIds.has(id)) {
          backupThreadMessages(db, id);
          db.prepare("DELETE FROM chat_threads WHERE id = ?").run(id);
        }
      }

      data.threads.forEach((thread, sortIndex) => {
        const messageCount =
          thread.messages.length > 0 ? thread.messages.length : thread.messageCount;
        db.prepare(
          `INSERT INTO chat_threads (
             id, title, updated_at, title_generated, title_manual, message_count, sort_index
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             updated_at = excluded.updated_at,
             title_generated = excluded.title_generated,
             title_manual = excluded.title_manual,
             message_count = excluded.message_count,
             sort_index = excluded.sort_index`,
        ).run(
          thread.id,
          thread.title,
          thread.updatedAt,
          thread.titleGenerated === true ? 1 : 0,
          thread.titleManual === true ? 1 : 0,
          messageCount ?? null,
          sortIndex,
        );
      });
    }

    const nextIds = new Set(data.threads.map((thread) => thread.id));

    if (previous && dirtyThreadIds.size > 0) {
      for (const threadId of dirtyThreadIds) {
        if (!nextIds.has(threadId)) continue;
        const thread = data.threads.find((item) => item.id === threadId);
        if (!thread) continue;
        if (thread.messages.length === 0 && thread.messageCount !== 0) continue;
        db.prepare(
          `INSERT INTO chat_thread_messages (thread_id, messages_json, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(thread_id) DO UPDATE SET
             messages_json = excluded.messages_json,
             updated_at = excluded.updated_at`,
        ).run(threadId, serializeMessagesBlob(threadId, thread.messages), ts);
      }
    } else if (!previous) {
      for (const thread of data.threads) {
        if (thread.messages.length === 0) continue;
        db.prepare(
          `INSERT INTO chat_thread_messages (thread_id, messages_json, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(thread_id) DO UPDATE SET
             messages_json = excluded.messages_json,
             updated_at = excluded.updated_at`,
        ).run(thread.id, serializeMessagesBlob(thread.id, thread.messages), ts);
      }
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  lastPersistedSnapshot = data;
}

/** Full import (localStorage migration / legacy restore). */
export function importChatStoreToDatabase(data: ChatStoreData): void {
  const db = openDatabase();
  const ts = Date.now();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM chat_thread_messages");
    db.exec("DELETE FROM chat_threads");
    db.exec("DELETE FROM chat_meta");

    db.prepare(
      `INSERT INTO chat_meta (id, version, active_thread_id, open_tab_ids_json, tab_strip_persisted, working_directory)
       VALUES (1, ?, ?, ?, ?, ?)`,
    ).run(
      CHAT_STORE_VERSION,
      data.activeThreadId,
      JSON.stringify(data.openTabIds),
      data.tabStripPersisted === true ? 1 : 0,
      data.workingDirectory,
    );

    data.threads.forEach((thread, sortIndex) => {
      const messageCount =
        thread.messages.length > 0 ? thread.messages.length : thread.messageCount ?? 0;
      db.prepare(
        `INSERT INTO chat_threads (
           id, title, updated_at, title_generated, title_manual, message_count, sort_index
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        thread.id,
        thread.title,
        thread.updatedAt,
        thread.titleGenerated === true ? 1 : 0,
        thread.titleManual === true ? 1 : 0,
        messageCount,
        sortIndex,
      );
      if (thread.messages.length > 0) {
        db.prepare(
          `INSERT INTO chat_thread_messages (thread_id, messages_json, updated_at)
           VALUES (?, ?, ?)`,
        ).run(thread.id, serializeMessagesBlob(thread.id, thread.messages), ts);
      }
    });

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  lastPersistedSnapshot = data;
}

export function getLastDatabasePersistedSnapshot(): ChatStoreData | null {
  return lastPersistedSnapshot;
}

export function resetDatabasePersistedSnapshotForTests(): void {
  lastPersistedSnapshot = null;
}
