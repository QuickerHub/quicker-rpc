import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  CHAT_STORAGE_BACKUP_KEY,
  CHAT_STORAGE_KEY,
  CHAT_STORE_VERSION,
  countPersistedMessages,
  defaultChatStore,
  loadChatStore,
  saveChatStore,
  shouldBackupChatStoreBeforeSave,
  threadBackupStorageKey,
  threadStorageKey,
  updateThreadMessages,
} from "@/lib/chat-store";
import { resetPersistedSnapshotForTests as resetPersistSnapshot } from "@/lib/chat-store-persist";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
};

function createMemoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
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
  resetPersistSnapshot();
});

afterEach(() => {
  uninstallWindow();
  resetPersistSnapshot();
});

test("updateThreadMessages rejects empty overwrite of persisted thread", () => {
  const store = defaultChatStore();
  const threadId = store.activeThreadId;
  const withMessages = updateThreadMessages(store, threadId, [sampleMessage("m1")]);
  const wiped = updateThreadMessages(withMessages, threadId, []);
  assert.equal(wiped.threads[0]!.messages.length, 1);
});

test("saveChatStore writes v3 index and per-thread message blobs", () => {
  const store = defaultChatStore();
  const threadId = store.activeThreadId;
  const withMessages = updateThreadMessages(store, threadId, [sampleMessage("m1")]);
  saveChatStore(withMessages);

  const index = JSON.parse(globalThis.localStorage!.getItem(CHAT_STORAGE_KEY)!);
  assert.equal(index.version, CHAT_STORE_VERSION);
  assert.equal(index.threads[0]!.id, threadId);
  assert.equal("messages" in index.threads[0]!, false);

  const threadBlob = JSON.parse(
    globalThis.localStorage!.getItem(threadStorageKey(threadId))!,
  );
  assert.equal(threadBlob.messages.length, 1);
});

test("saveChatStore backs up index and thread blob before wiping messages", () => {
  const store = defaultChatStore();
  const threadId = store.activeThreadId;
  const withMessages = updateThreadMessages(store, threadId, [
    sampleMessage("m1"),
    sampleMessage("m2"),
  ]);
  saveChatStore(withMessages);
  saveChatStore(defaultChatStore());

  const backupIndex = JSON.parse(
    globalThis.localStorage!.getItem(CHAT_STORAGE_BACKUP_KEY)!,
  );
  assert.equal(backupIndex.version, CHAT_STORE_VERSION);
  assert.ok(globalThis.localStorage!.getItem(threadBackupStorageKey(threadId)));
});

test("loadChatStore restores from chunked backup when primary index is empty", () => {
  const store = defaultChatStore();
  const threadId = store.activeThreadId;
  const withMessages = updateThreadMessages(store, threadId, [sampleMessage("m1")]);
  saveChatStore(withMessages);
  saveChatStore(defaultChatStore());

  resetPersistSnapshot();
  const loaded = loadChatStore();
  assert.equal(countPersistedMessages(loaded), 1);
  assert.equal(loaded.threads.find((thread) => thread.id === threadId)?.messages[0]?.id, "m1");
});

test("saveChatStore only rewrites changed thread message blob", () => {
  const store = defaultChatStore();
  const threadA = store.activeThreadId;
  const threadB = crypto.randomUUID();
  const twoThreads = {
    ...updateThreadMessages(store, threadA, [sampleMessage("a1")]),
    threads: [
      ...updateThreadMessages(store, threadA, [sampleMessage("a1")]).threads,
      {
        id: threadB,
        title: "新对话",
        messages: [sampleMessage("b1")],
        updatedAt: Date.now(),
      },
    ],
    openTabIds: [threadA, threadB],
  };
  saveChatStore(twoThreads);

  const beforeA = globalThis.localStorage!.getItem(threadStorageKey(threadA));
  const beforeB = globalThis.localStorage!.getItem(threadStorageKey(threadB));

  const updatedA = updateThreadMessages(twoThreads, threadA, [
    sampleMessage("a1"),
    sampleMessage("a2"),
  ]);
  saveChatStore(updatedA);

  assert.notEqual(
    globalThis.localStorage!.getItem(threadStorageKey(threadA)),
    beforeA,
  );
  assert.equal(
    globalThis.localStorage!.getItem(threadStorageKey(threadB)),
    beforeB,
  );
});

test("migrates monolithic v2 blob to chunked v3 on load", () => {
  const store = defaultChatStore();
  const threadId = store.activeThreadId;
  const withMessages = updateThreadMessages(store, threadId, [sampleMessage("legacy")]);
  globalThis.localStorage!.setItem(
    CHAT_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      activeThreadId: threadId,
      openTabIds: [threadId],
      workingDirectory: "",
      threads: withMessages.threads,
    }),
  );

  resetPersistSnapshot();
  const loaded = loadChatStore();
  assert.equal(loaded.threads[0]!.messages[0]!.id, "legacy");

  const index = JSON.parse(globalThis.localStorage!.getItem(CHAT_STORAGE_KEY)!);
  assert.equal(index.version, CHAT_STORE_VERSION);
  assert.ok(globalThis.localStorage!.getItem(threadStorageKey(threadId)));
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
