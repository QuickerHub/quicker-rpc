import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  CHAT_STORAGE_BACKUP_KEY,
  CHAT_STORAGE_KEY,
  resetPersistedSnapshotForTests,
  threadBackupStorageKey,
  threadStorageKey,
  CHAT_STORE_VERSION,
} from "@/lib/chat-store-persist";
import {
  defaultChatStore,
  saveChatStore,
  updateThreadMessages,
} from "@/lib/chat-store";
import {
  maybeAutoRestoreChatStoreOnBoot,
  resetAutoRestoreAttemptedForTests,
} from "@/lib/chat-store-boot-restore";
import { setChatStorePersistenceModeForTests } from "@/lib/chat-store-backend";

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
  const shim = { localStorage: storage, sessionStorage: storage };
  (globalThis as {
    window?: typeof shim;
    localStorage?: StorageLike;
    sessionStorage?: StorageLike;
    fetch?: typeof fetch;
  }).window = shim;
  (globalThis as { localStorage?: StorageLike }).localStorage = storage;
  (globalThis as { sessionStorage?: StorageLike }).sessionStorage = storage;
}

function uninstallWindow(): void {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  delete (globalThis as { fetch?: unknown }).fetch;
}

function sampleMessage(id: string): AgentUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: "hello" }],
  };
}

function installEmptyDiskScan(): void {
  (globalThis as { fetch?: typeof fetch }).fetch = (async () =>
    new Response(JSON.stringify({ hits: [], scannedRoots: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

beforeEach(() => {
  setChatStorePersistenceModeForTests("localStorage");
  installWindow(createMemoryStorage());
  resetPersistedSnapshotForTests();
  resetAutoRestoreAttemptedForTests();
  installEmptyDiskScan();
});

afterEach(() => {
  uninstallWindow();
  resetPersistedSnapshotForTests();
  resetAutoRestoreAttemptedForTests();
  setChatStorePersistenceModeForTests("api");
});

test("maybeAutoRestoreChatStoreOnBoot restores chunked backup from localStorage", async () => {
  const store = defaultChatStore();
  const threadId = store.activeThreadId;
  const withMessages = updateThreadMessages(store, threadId, [sampleMessage("boot-restore")]);
  saveChatStore(withMessages);
  saveChatStore(defaultChatStore());

  resetPersistedSnapshotForTests();
  resetAutoRestoreAttemptedForTests();

  const restored = await maybeAutoRestoreChatStoreOnBoot(defaultChatStore());
  assert.ok(restored);
  assert.equal(restored!.threads.some((thread) => thread.messages.length > 0), true);
});

test("maybeAutoRestoreChatStoreOnBoot skips when current store already has messages", async () => {
  const store = defaultChatStore();
  const withMessages = updateThreadMessages(store, store.activeThreadId, [
    sampleMessage("existing"),
  ]);

  const restored = await maybeAutoRestoreChatStoreOnBoot(withMessages);
  assert.equal(restored, null);
});

test("maybeAutoRestoreChatStoreOnBoot merges disk scan candidates when localStorage is empty", async () => {
  const threadId = crypto.randomUUID();
  const legacyStore = {
    version: CHAT_STORE_VERSION,
    activeThreadId: threadId,
    openTabIds: [threadId],
    workingDirectory: "",
    threads: [
      {
        id: threadId,
        title: "disk chat",
        updatedAt: Date.now(),
        messages: [sampleMessage("disk")],
      },
    ],
  };

  (globalThis as { fetch?: typeof fetch }).fetch = (async () =>
    new Response(
      JSON.stringify({
        hits: [
          {
            source: "LevelDB · test.ldb",
            storageKey: CHAT_STORAGE_KEY,
            json: JSON.stringify(legacyStore),
          },
        ],
        scannedRoots: ["C:\\fake\\leveldb"],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    )) as typeof fetch;

  const restored = await maybeAutoRestoreChatStoreOnBoot(defaultChatStore());
  assert.ok(restored);
  assert.equal(
    restored!.threads.find((thread) => thread.id === threadId)?.messages[0]?.id,
    "disk",
  );
});

test("maybeAutoRestoreChatStoreOnBoot runs only once per session", async () => {
  const store = defaultChatStore();
  const threadId = store.activeThreadId;
  const withMessages = updateThreadMessages(store, threadId, [sampleMessage("once")]);
  saveChatStore(withMessages);
  saveChatStore(defaultChatStore());

  resetPersistedSnapshotForTests();

  const first = await maybeAutoRestoreChatStoreOnBoot(defaultChatStore());
  assert.ok(first);

  globalThis.localStorage!.removeItem(CHAT_STORAGE_KEY);
  globalThis.localStorage!.removeItem(CHAT_STORAGE_BACKUP_KEY);
  globalThis.localStorage!.removeItem(threadStorageKey(threadId));
  globalThis.localStorage!.removeItem(threadBackupStorageKey(threadId));

  const second = await maybeAutoRestoreChatStoreOnBoot(defaultChatStore());
  assert.equal(second, null);
});
