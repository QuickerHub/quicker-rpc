import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  addThread,
  CHAT_STORAGE_BACKUP_KEY,
  CHAT_STORAGE_KEY,
  CHAT_STORE_VERSION,
  countPersistedMessages,
  defaultChatStore,
  getOpenTabThreads,
  isThreadEmpty,
  loadChatStore,
  normalizeLoadedStore,
  saveChatStore,
  selectThread,
  shouldBackupChatStoreBeforeSave,
  threadBackupStorageKey,
  threadStorageKey,
  tryRestoreLegacyChatStore,
  updateThreadMessages,
} from "@/lib/chat-store";
import { setChatStorePersistenceModeForTests } from "@/lib/chat-store-backend";
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
  setChatStorePersistenceModeForTests("localStorage");
  installWindow(createMemoryStorage());
  resetPersistSnapshot();
});

afterEach(() => {
  uninstallWindow();
  resetPersistSnapshot();
  setChatStorePersistenceModeForTests("api");
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

test("addThread opens a new tab when the active tab is empty", () => {
  const store = defaultChatStore();
  const firstTabId = store.activeThreadId;

  const next = addThread(store);
  const tabs = getOpenTabThreads(next);

  assert.equal(tabs.length, 2);
  assert.notEqual(next.activeThreadId, firstTabId);
  assert.ok(tabs.some((thread) => thread.id === firstTabId));
  assert.ok(tabs.some((thread) => thread.id === next.activeThreadId));
});

test("addThread can open multiple consecutive empty tabs", () => {
  let store = defaultChatStore();
  store = addThread(store);
  store = addThread(store);
  store = addThread(store);

  const tabs = getOpenTabThreads(store);
  assert.equal(tabs.length, 4);
  assert.equal(tabs.filter((thread) => thread.messages.length === 0).length, 4);
});

test("selectThread keeps inactive empty tabs in the tab strip", () => {
  const store = defaultChatStore();
  const firstEmptyId = store.activeThreadId;
  const withTwoEmpties = addThread(store);
  const secondEmptyId = withTwoEmpties.activeThreadId;
  const withContent = updateThreadMessages(withTwoEmpties, firstEmptyId, [
    sampleMessage("hello"),
  ]);

  const selected = selectThread(withContent, firstEmptyId);

  assert.equal(getOpenTabThreads(selected).length, 2);
  assert.ok(selected.openTabIds.includes(secondEmptyId));
});

test("normalizeLoadedStore repairs legacy full tab strip expansion on load", () => {
  const threadA = crypto.randomUUID();
  const threadB = crypto.randomUUID();
  const threadC = crypto.randomUUID();
  const bloated = {
    ...defaultChatStore(),
    activeThreadId: threadB,
    threads: [
      {
        id: threadA,
        title: "a",
        messages: [sampleMessage("a")],
        updatedAt: Date.now(),
      },
      {
        id: threadB,
        title: "b",
        messages: [sampleMessage("b")],
        updatedAt: Date.now(),
      },
      {
        id: threadC,
        title: "c",
        messages: [sampleMessage("c")],
        updatedAt: Date.now(),
      },
    ],
    openTabIds: [threadA, threadB, threadC],
    tabStripPersisted: false,
  };

  const normalized = normalizeLoadedStore(bloated);

  assert.deepEqual(normalized.openTabIds, [threadB]);
});

test("tryRestoreLegacyChatStore does not merge imported openTabIds into tab strip", () => {
  const store = defaultChatStore();
  const current = updateThreadMessages(store, store.activeThreadId, [
    sampleMessage("current"),
  ]);
  const importedA = crypto.randomUUID();
  const importedB = crypto.randomUUID();
  const legacy = {
    ...defaultChatStore(),
    activeThreadId: importedA,
    threads: [
      {
        id: importedA,
        title: "imported-a",
        messages: [sampleMessage("a")],
        updatedAt: Date.now(),
      },
      {
        id: importedB,
        title: "imported-b",
        messages: [sampleMessage("b")],
        updatedAt: Date.now(),
      },
    ],
    openTabIds: [importedA, importedB],
    tabStripPersisted: true,
  };

  const { next, result } = tryRestoreLegacyChatStore(current, [
    { source: "test-import", data: legacy },
  ]);

  assert.ok(result.ok);
  assert.equal(getOpenTabThreads(next).length, 1);
  assert.equal(next.threads.filter((thread) => thread.messages.length > 0).length, 3);
});

test("tryRestoreLegacyChatStore replaces empty active tab strip after import", () => {
  const current = defaultChatStore();
  const importedId = crypto.randomUUID();
  const legacy = {
    ...defaultChatStore(),
    activeThreadId: importedId,
    threads: [
      {
        id: importedId,
        title: "imported",
        messages: [sampleMessage("imported")],
        updatedAt: Date.now(),
      },
    ],
    openTabIds: [importedId],
    tabStripPersisted: true,
  };

  const { next, result } = tryRestoreLegacyChatStore(current, [
    { source: "test-import", data: legacy },
  ]);

  assert.ok(result.ok);
  assert.deepEqual(next.openTabIds, [importedId]);
  assert.equal(getOpenTabThreads(next).length, 1);
});

test("addThread always creates a fresh tab even when a hidden empty thread exists", () => {
  const store = defaultChatStore();
  const activeTabId = store.activeThreadId;
  const hiddenEmptyId = crypto.randomUUID();
  const withContent = updateThreadMessages(store, activeTabId, [sampleMessage("m1")]);
  const withHiddenEmpty = {
    ...withContent,
    threads: [
      ...withContent.threads,
      {
        id: hiddenEmptyId,
        title: "新对话",
        messages: [],
        updatedAt: Date.now(),
        messageCount: 0,
      },
    ],
    openTabIds: [activeTabId],
  };

  const next = addThread(withHiddenEmpty);

  assert.notEqual(next.activeThreadId, hiddenEmptyId);
  assert.notEqual(next.activeThreadId, activeTabId);
  assert.equal(getOpenTabThreads(next).length, 2);
  assert.equal(next.threads.filter((thread) => isThreadEmpty(thread)).length, 1);
  assert.ok(!next.threads.some((thread) => thread.id === hiddenEmptyId));
});

function storeWithSidebarHistory(): {
  store: ReturnType<typeof defaultChatStore>;
  threadA: string;
  threadB: string;
} {
  const base = defaultChatStore();
  const threadA = base.activeThreadId;
  const threadB = crypto.randomUUID();
  const withA = updateThreadMessages(base, threadA, [sampleMessage("a1")]);
  const store = {
    ...withA,
    threads: [
      ...withA.threads,
      {
        id: threadB,
        title: "历史对话 B",
        messages: [sampleMessage("b1"), sampleMessage("b2")],
        updatedAt: Date.now() - 60_000,
        messageCount: 2,
      },
    ],
    // B lives only in sidebar history (its tab is closed).
    openTabIds: [threadA],
    tabStripPersisted: true,
  };
  return { store, threadA, threadB };
}

test("sidebar-only thread survives an app restart (lazy hydration)", () => {
  const { store, threadB } = storeWithSidebarHistory();
  saveChatStore(store);

  // Fresh app boot: in-memory snapshot is gone, messages load lazily.
  resetPersistSnapshot();
  const loaded = loadChatStore();

  assert.ok(
    globalThis.localStorage!.getItem(threadStorageKey(threadB)),
    "thread B message blob must not be deleted",
  );
  assert.ok(
    loaded.threads.some((thread) => thread.id === threadB),
    "thread B must stay in the loaded store",
  );
  const index = JSON.parse(globalThis.localStorage!.getItem(CHAT_STORAGE_KEY)!) as {
    threads: Array<{ id: string }>;
  };
  assert.ok(
    index.threads.some((thread) => thread.id === threadB),
    "thread B must stay in the persisted index",
  );
});

test("addThread after restart keeps unhydrated sidebar threads", () => {
  const { store, threadB } = storeWithSidebarHistory();
  saveChatStore(store);

  resetPersistSnapshot();
  const loaded = loadChatStore();
  const next = addThread(loaded);
  saveChatStore(next);

  assert.ok(next.threads.some((thread) => thread.id === threadB));
  assert.ok(globalThis.localStorage!.getItem(threadStorageKey(threadB)));
});

test("legacy v3 index without messageCount is treated as non-empty", () => {
  const { store, threadB } = storeWithSidebarHistory();
  saveChatStore(store);

  // Simulate an index written by an older build (no messageCount field).
  const rawIndex = JSON.parse(globalThis.localStorage!.getItem(CHAT_STORAGE_KEY)!) as {
    threads: Array<Record<string, unknown>>;
  };
  for (const meta of rawIndex.threads) {
    delete meta.messageCount;
  }
  globalThis.localStorage!.setItem(CHAT_STORAGE_KEY, JSON.stringify(rawIndex));

  resetPersistSnapshot();
  const loaded = loadChatStore();

  assert.ok(loaded.threads.some((thread) => thread.id === threadB));
  assert.ok(globalThis.localStorage!.getItem(threadStorageKey(threadB)));
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
      thread.id === threadA
        ? { ...thread, messages: [], messageCount: 0 }
        : thread,
    ),
  };
  assert.equal(shouldBackupChatStoreBeforeSave(prev, next), true);
});
