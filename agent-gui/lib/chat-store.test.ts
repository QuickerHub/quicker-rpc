import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  CHAT_STORAGE_BACKUP_KEY,
  CHAT_STORAGE_KEY,
  countPersistedMessages,
  defaultChatStore,
  loadChatStore,
  saveChatStore,
  shouldBackupChatStoreBeforeSave,
  updateThreadMessages,
} from "@/lib/chat-store";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function createMemoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  };
}

function installWindow(storage: StorageLike): void {
  const shim = { localStorage: storage };
  (globalThis as { window?: typeof shim; localStorage?: StorageLike }).window = shim;
  (globalThis as { localStorage?: StorageLike }).localStorage = storage;
}

function uninstallWindow(): void {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
}

function sampleMessage(id: string): AgentUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: "hello" }],
  };
}

beforeEach(() => {
  installWindow(createMemoryStorage());
});

afterEach(() => {
  uninstallWindow();
});

test("updateThreadMessages rejects empty overwrite of persisted thread", () => {
  const store = defaultChatStore();
  const threadId = store.activeThreadId;
  const withMessages = updateThreadMessages(store, threadId, [sampleMessage("m1")]);
  const wiped = updateThreadMessages(withMessages, threadId, []);
  assert.equal(wiped.threads[0]!.messages.length, 1);
});

test("saveChatStore backs up before wiping all messages", () => {
  const store = defaultChatStore();
  const threadId = store.activeThreadId;
  const withMessages = updateThreadMessages(store, threadId, [
    sampleMessage("m1"),
    sampleMessage("m2"),
  ]);
  saveChatStore(withMessages);

  saveChatStore(defaultChatStore());

  const backup = globalThis.window!.localStorage.getItem(CHAT_STORAGE_BACKUP_KEY);
  assert.ok(backup);
  assert.equal(countPersistedMessages(JSON.parse(backup!)), 2);
});

test("loadChatStore restores from backup when primary blob is empty", () => {
  const store = defaultChatStore();
  const threadId = store.activeThreadId;
  const withMessages = updateThreadMessages(store, threadId, [sampleMessage("m1")]);
  saveChatStore(withMessages);
  saveChatStore(defaultChatStore());

  const loaded = loadChatStore();
  assert.equal(countPersistedMessages(loaded), 1);
  assert.equal(loaded.threads[0]!.messages[0]!.id, "m1");
});

test("shouldBackupChatStoreBeforeSave detects per-thread wipe", () => {
  const store = defaultChatStore();
  const threadA = store.activeThreadId;
  const threadB = crypto.randomUUID();
  const twoThreads = {
    ...updateThreadMessages(store, threadA, [sampleMessage("a")]),
    threads: [
      ...updateThreadMessages(store, threadA, [sampleMessage("a")]).threads,
      {
        id: threadB,
        title: "新对话",
        messages: [sampleMessage("b")],
        updatedAt: Date.now(),
      },
    ],
  };
  const prev = twoThreads;
  const next = {
    ...prev,
    threads: prev.threads.map((thread) =>
      thread.id === threadA ? { ...thread, messages: [] } : thread,
    ),
  };
  assert.equal(shouldBackupChatStoreBeforeSave(prev, next), true);
});
