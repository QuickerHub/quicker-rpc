import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { ChatStoreData } from "@/lib/chat-store";
import {
  defaultChatStore,
  scheduleSaveChatStore,
  updateThreadMessages,
} from "@/lib/chat-store";
import {
  flushPendingChatStoreApiSaveAsync,
  resetClientPersistedSnapshotForTests,
  setClientPersistedSnapshot,
} from "@/lib/chat-store-api.client";
import { setChatStorePersistenceModeForTests } from "@/lib/chat-store-backend";

type CapturedPut = { store: ChatStoreData; previous: ChatStoreData | null };

function installWindowShim(): void {
  const shim = { setTimeout: globalThis.setTimeout.bind(globalThis) };
  (globalThis as { window?: typeof shim }).window = shim;
}

function uninstallWindowShim(): void {
  delete (globalThis as { window?: unknown }).window;
}

function installFetchMock(options: { ok: boolean; puts: CapturedPut[] }): void {
  (globalThis as { fetch?: unknown }).fetch = async (
    _url: string,
    init?: { method?: string; body?: string },
  ) => {
    if (init?.method === "PUT" && typeof init.body === "string") {
      const parsed = JSON.parse(init.body) as ChatStoreData & {
        previous?: ChatStoreData | null;
      };
      const { previous, ...store } = parsed;
      options.puts.push({ store: store as ChatStoreData, previous: previous ?? null });
    }
    return { ok: options.ok, json: async () => ({ ok: options.ok }) };
  };
}

function sampleMessage(id: string): AgentUIMessage {
  return { id, role: "user", parts: [{ type: "text", text: "hello" }] };
}

const originalFetch = (globalThis as { fetch?: unknown }).fetch;

beforeEach(() => {
  installWindowShim();
  setChatStorePersistenceModeForTests("api");
  resetClientPersistedSnapshotForTests();
});

afterEach(() => {
  setChatStorePersistenceModeForTests("localStorage");
  resetClientPersistedSnapshotForTests();
  uninstallWindowShim();
  (globalThis as { fetch?: unknown }).fetch = originalFetch;
});

test("PUT previous lags behind scheduled store so the server sees a diff", async () => {
  const puts: CapturedPut[] = [];
  installFetchMock({ ok: true, puts });

  const base = defaultChatStore();
  setClientPersistedSnapshot(base);

  const updated = updateThreadMessages(base, base.activeThreadId, [
    sampleMessage("m1"),
  ]);
  scheduleSaveChatStore(updated);
  await flushPendingChatStoreApiSaveAsync();

  assert.equal(puts.length, 1);
  // Regression: previous must be the last persisted snapshot, not the store
  // being saved — otherwise the server-side diff writes nothing to SQLite.
  assert.equal(puts[0]!.previous?.threads[0]?.messages.length, 0);
  assert.equal(puts[0]!.store.threads[0]?.messages.length, 1);
});

test("successful PUT advances the persisted snapshot for the next save", async () => {
  const puts: CapturedPut[] = [];
  installFetchMock({ ok: true, puts });

  const base = defaultChatStore();
  setClientPersistedSnapshot(base);

  const first = updateThreadMessages(base, base.activeThreadId, [
    sampleMessage("m1"),
  ]);
  scheduleSaveChatStore(first);
  await flushPendingChatStoreApiSaveAsync();

  const second = updateThreadMessages(first, base.activeThreadId, [
    sampleMessage("m1"),
    sampleMessage("m2"),
  ]);
  scheduleSaveChatStore(second);
  await flushPendingChatStoreApiSaveAsync();

  assert.equal(puts.length, 2);
  assert.equal(puts[1]!.previous?.threads[0]?.messages.length, 1);
  assert.equal(puts[1]!.store.threads[0]?.messages.length, 2);
});

test("failed PUT keeps the snapshot pending for a later flush", async () => {
  const puts: CapturedPut[] = [];
  installFetchMock({ ok: false, puts });

  const base = defaultChatStore();
  setClientPersistedSnapshot(base);

  const updated = updateThreadMessages(base, base.activeThreadId, [
    sampleMessage("m1"),
  ]);
  scheduleSaveChatStore(updated);
  await flushPendingChatStoreApiSaveAsync();
  assert.equal(puts.length, 1);

  installFetchMock({ ok: true, puts });
  await flushPendingChatStoreApiSaveAsync();

  assert.equal(puts.length, 2);
  assert.equal(puts[1]!.store.threads[0]?.messages.length, 1);
  // previous still points at the last persisted snapshot.
  assert.equal(puts[1]!.previous?.threads[0]?.messages.length, 0);
});
