import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  CHAT_STORE_VERSION,
  countPersistedMessages,
  defaultChatStore,
  normalizeLoadedStore,
  updateThreadMessages,
} from "@/lib/chat-store";
import {
  openChatDatabaseAt,
  resetChatDatabaseClientForTests,
} from "@/lib/db/client";
import {
  ChatStoreSaveWouldWipeError,
  countPersistedMessagesInDatabase,
  importChatStoreToDatabase,
  loadChatStoreFromDatabase,
  loadThreadMessagesFromDatabase,
  mergeImportedChatStoreIntoDatabase,
  resetDatabasePersistedSnapshotForTests,
  saveChatStoreToDatabase,
} from "@/lib/db/chat-store.repository";

function sampleMessage(id: string): AgentUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: `msg-${id}` }],
  };
}

let tempDir = "";

function createLegacyNodeSqliteDatabase(path: string): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE chat_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      active_thread_id TEXT NOT NULL,
      open_tab_ids_json TEXT NOT NULL,
      tab_strip_persisted INTEGER,
      working_directory TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE chat_threads (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      title_generated INTEGER NOT NULL DEFAULT 0,
      title_manual INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER,
      sort_index INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE chat_thread_messages (
      thread_id TEXT PRIMARY KEY,
      messages_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE chat_thread_messages_backup (
      thread_id TEXT PRIMARY KEY,
      messages_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const threadId = "legacy-thread-1";
  const blob = JSON.stringify({
    version: 1,
    threadId,
    messages: [sampleMessage("legacy-1")],
  });
  db.prepare(
    `INSERT INTO chat_meta (id, version, active_thread_id, open_tab_ids_json, tab_strip_persisted, working_directory)
     VALUES (1, ?, ?, ?, 1, '')`,
  ).run(CHAT_STORE_VERSION, threadId, JSON.stringify([threadId]));
  db.prepare(
    `INSERT INTO chat_threads (id, title, updated_at, title_generated, title_manual, message_count, sort_index)
     VALUES (?, 'Legacy', ?, 0, 0, 1, 0)`,
  ).run(threadId, Date.now());
  db.prepare(
    `INSERT INTO chat_thread_messages (thread_id, messages_json, updated_at) VALUES (?, ?, ?)`,
  ).run(threadId, blob, Date.now());
  db.close();
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "chat-db-safety-"));
});

afterEach(() => {
  resetChatDatabaseClientForTests();
  resetDatabasePersistedSnapshotForTests();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

test("legacy pre-Drizzle schema opens and preserves messages after migration", () => {
  const dbPath = join(tempDir, "chats.db");
  createLegacyNodeSqliteDatabase(dbPath);

  openChatDatabaseAt(dbPath);
  const loaded = loadChatStoreFromDatabase({ messageScope: "all" });
  assert.ok(loaded);
  assert.equal(countPersistedMessages(loaded!), 1);
  assert.equal(loaded!.threads[0]!.messages[0]?.id, "legacy-1");
  assert.equal(loaded!.threads[0]!.workspaceId, loaded!.activeWorkspaceId);
});

test("first Drizzle open creates pre-drizzle backup of populated legacy DB", () => {
  const dbPath = join(tempDir, "chats.db");
  createLegacyNodeSqliteDatabase(dbPath);
  const backupPath = `${dbPath}.pre-drizzle.bak`;

  openChatDatabaseAt(dbPath);
  assert.ok(existsSync(backupPath));

  const backupDb = new Database(backupPath, { readonly: true });
  const row = backupDb
    .prepare("SELECT COUNT(*) AS c FROM chat_thread_messages")
    .get() as { c: number };
  backupDb.close();
  assert.equal(row.c, 1);
});

test("reopening migrated database is idempotent and keeps messages", () => {
  const dbPath = join(tempDir, "chats.db");
  const base = defaultChatStore();
  const store = updateThreadMessages(base, base.activeThreadId, [
    sampleMessage("round-trip"),
  ]);

  openChatDatabaseAt(dbPath);
  saveChatStoreToDatabase(store);
  resetChatDatabaseClientForTests();
  resetDatabasePersistedSnapshotForTests();

  openChatDatabaseAt(dbPath);
  const loaded = loadChatStoreFromDatabase({ messageScope: "all" });
  assert.equal(loaded?.threads[0]?.messages[0]?.id, "round-trip");

  resetChatDatabaseClientForTests();
  resetDatabasePersistedSnapshotForTests();
  openChatDatabaseAt(dbPath);
  const loadedAgain = loadChatStoreFromDatabase({ messageScope: "all" });
  assert.equal(loadedAgain?.threads[0]?.messages[0]?.id, "round-trip");
});

test("save without previous snapshot does not delete existing sidebar threads", () => {
  const dbPath = join(tempDir, "chats.db");
  const base = defaultChatStore();
  const threadA = base.activeThreadId;
  const threadB = "b0000000-0000-4000-8000-000000000002";
  const withA = updateThreadMessages(base, threadA, [sampleMessage("a1")]);
  const full = {
    ...withA,
    threads: [
      ...withA.threads,
      {
        id: threadB,
        title: "sidebar B",
        messages: [sampleMessage("b1")],
        updatedAt: Date.now(),
        messageCount: 1,
        workspaceId: withA.activeWorkspaceId,
      },
    ],
    openTabIds: [threadA],
  };

  openChatDatabaseAt(dbPath);
  saveChatStoreToDatabase(full);
  resetDatabasePersistedSnapshotForTests();

  const clientView = loadChatStoreFromDatabase({ messageScope: "active" });
  assert.ok(clientView);
  saveChatStoreToDatabase(clientView!, { previous: null });

  const reloaded = loadChatStoreFromDatabase({ messageScope: "all" });
  assert.equal(countPersistedMessages(reloaded!), 2);
  assert.equal(loadThreadMessagesFromDatabase(threadB)[0]?.id, "b1");
});

test("save guard rejects wipe-all payload", () => {
  const dbPath = join(tempDir, "chats.db");
  const base = defaultChatStore();
  const store = updateThreadMessages(base, base.activeThreadId, [
    sampleMessage("keep-me"),
  ]);

  openChatDatabaseAt(dbPath);
  saveChatStoreToDatabase(store);
  resetDatabasePersistedSnapshotForTests();

  const empty = defaultChatStore();
  assert.throws(
    () => saveChatStoreToDatabase(empty, { previous: store }),
    ChatStoreSaveWouldWipeError,
  );
  assert.equal(countPersistedMessagesInDatabase(), 1);
});

test("import refuses to replace existing message blobs without allowWipe", () => {
  const dbPath = join(tempDir, "chats.db");
  const firstBase = defaultChatStore();
  const first = updateThreadMessages(firstBase, firstBase.activeThreadId, [
    sampleMessage("first"),
  ]);

  openChatDatabaseAt(dbPath);
  saveChatStoreToDatabase(first);
  assert.equal(countPersistedMessagesInDatabase(), 1);

  const secondBase = defaultChatStore();
  const second = updateThreadMessages(secondBase, secondBase.activeThreadId, [
    sampleMessage("second"),
  ]);
  assert.throws(
    () => importChatStoreToDatabase(second),
    (err: unknown) => err instanceof ChatStoreSaveWouldWipeError,
  );
});

test("mergeImportedChatStoreIntoDatabase writes message blobs for legacy restore", () => {
  const dbPath = join(tempDir, "chats.db");
  const shell = defaultChatStore();

  openChatDatabaseAt(dbPath);
  saveChatStoreToDatabase(shell);
  resetDatabasePersistedSnapshotForTests();

  const legacyThreadId = "legacy-import-thread";
  const imported = normalizeLoadedStore({
    ...shell,
    threads: [
      ...shell.threads,
      {
        id: legacyThreadId,
        title: "旧对话",
        messages: [sampleMessage("legacy-1")],
        updatedAt: Date.now(),
        messageCount: 1,
        workspaceId: shell.activeWorkspaceId,
      },
    ],
  });

  const written = mergeImportedChatStoreIntoDatabase(imported);
  assert.equal(written, 1);
  assert.deepEqual(
    loadThreadMessagesFromDatabase(legacyThreadId).map((msg) => msg.id),
    ["legacy-1"],
  );
});

test("copying existing user DB file remains readable after Drizzle open", () => {
  const userDb = process.env.CHAT_DB_SAFETY_TEST_PATH?.trim();
  if (!userDb || !existsSync(userDb)) {
    return;
  }

  const dbPath = join(tempDir, "chats-copy.db");
  copyFileSync(userDb, dbPath);
  if (existsSync(`${userDb}-wal`)) {
    copyFileSync(`${userDb}-wal`, `${dbPath}-wal`);
  }
  if (existsSync(`${userDb}-shm`)) {
    copyFileSync(`${userDb}-shm`, `${dbPath}-shm`);
  }

  const before = readFileSync(dbPath);
  openChatDatabaseAt(dbPath);
  const loaded = loadChatStoreFromDatabase({ messageScope: "all" });
  assert.ok(loaded);
  const after = readFileSync(dbPath);
  assert.ok(after.length >= before.length);
});
