import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  countPersistedMessages,
  defaultChatStore,
  updateThreadMessages,
} from "@/lib/chat-store";
import {
  chatDatabaseHasPersistedMessages,
  importChatStoreToDatabase,
  loadChatStoreFromDatabase,
  loadThreadMessagesFromDatabase,
  openChatDatabaseAt,
  resetChatDatabaseForTests,
  resetDatabasePersistedSnapshotForTests,
  saveChatStoreToDatabase,
} from "@/lib/chat-store-db.server";

function sampleMessage(id: string): AgentUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: "hello" }],
  };
}

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "chat-db-test-"));
  openChatDatabaseAt(join(tempDir, "chats.db"));
});

afterEach(() => {
  resetChatDatabaseForTests();
  resetDatabasePersistedSnapshotForTests();
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

test("save and load chat store from SQLite with lazy active scope", () => {
  const base = defaultChatStore();
  const threadA = base.activeThreadId;
  const threadB = "b0000000-0000-4000-8000-000000000002";
  const withA = updateThreadMessages(base, threadA, [sampleMessage("a1")]);
  const store = {
    ...withA,
    threads: [
      ...withA.threads,
      {
        id: threadB,
        title: "历史 B",
        messages: [sampleMessage("b1")],
        updatedAt: Date.now(),
        messageCount: 1,
      },
    ],
    openTabIds: [threadA],
    tabStripPersisted: true,
  };
  saveChatStoreToDatabase(store);

  resetDatabasePersistedSnapshotForTests();
  const loaded = loadChatStoreFromDatabase({ messageScope: "active" });
  assert.ok(loaded);
  // Sidebar thread B keeps messageCount while messages stay lazy-unloaded.
  assert.equal(countPersistedMessages(loaded!), 2);
  assert.equal(
    loaded!.threads.find((t) => t.id === threadA)?.messages[0]?.id,
    "a1",
  );
  assert.equal(loaded!.threads.find((t) => t.id === threadB)?.messages.length, 0);
  assert.equal(loaded!.threads.find((t) => t.id === threadB)?.messageCount, 1);

  const sidebarMessages = loadThreadMessagesFromDatabase(threadB);
  assert.equal(sidebarMessages[0]?.id, "b1");
});

test("importChatStoreToDatabase replaces existing rows", () => {
  const base = defaultChatStore();
  const first = updateThreadMessages(base, base.activeThreadId, [
    sampleMessage("first"),
  ]);
  importChatStoreToDatabase(first);
  assert.ok(chatDatabaseHasPersistedMessages());

  const secondBase = defaultChatStore();
  const second = updateThreadMessages(secondBase, secondBase.activeThreadId, [
    sampleMessage("second"),
  ]);
  importChatStoreToDatabase(second);

  const loaded = loadChatStoreFromDatabase({ messageScope: "all" });
  assert.equal(loaded?.threads[0]?.messages[0]?.id, "second");
});
