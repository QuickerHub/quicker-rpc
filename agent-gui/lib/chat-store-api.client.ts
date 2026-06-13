import type { ChatStoreData } from "@/lib/chat-store";
import {
  chatStoreHasPersistedMessages,
  defaultChatStore,
  loadChatStoreFromLocalStorage,
  normalizeLoadedStore,
} from "@/lib/chat-store";
import { loadPersistedChatStore } from "@/lib/chat-store-persist";
function loadLocalStorageForMigration(): ChatStoreData {
  const chunked = loadPersistedChatStore({ messageScope: "all" });
  if (chunked && chatStoreHasPersistedMessages(chunked)) {
    return normalizeLoadedStore(chunked);
  }
  return loadChatStoreFromLocalStorage();
}

let clientPersistedSnapshot: ChatStoreData | null = null;
let pendingApiSave: ChatStoreData | null = null;
let apiSaveScheduled = false;

export function setClientPersistedSnapshot(store: ChatStoreData | null): void {
  clientPersistedSnapshot = store;
}

/** @internal test helper */
export function resetClientPersistedSnapshotForTests(): void {
  clientPersistedSnapshot = null;
  pendingApiSave = null;
  apiSaveScheduled = false;
}

async function postMigrate(
  store: ChatStoreData,
  options?: { merge?: boolean },
): Promise<ChatStoreData | null> {
  const res = await fetch("/api/chat-store/migrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...store, merge: options?.merge === true }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { store?: ChatStoreData | null };
  if (!payload.store) return null;
  return normalizeLoadedStore(payload.store);
}

/** Persist legacy restore into SQLite without wiping existing threads. */
export async function importChatStoreMergeViaApi(
  store: ChatStoreData,
): Promise<ChatStoreData | null> {
  const migrated = await postMigrate(store, { merge: true });
  if (migrated) {
    clientPersistedSnapshot = migrated;
  }
  return migrated;
}

const CHAT_STORE_FETCH_TIMEOUT_MS = 5_000;

/** Load chat store from server SQLite; migrate localStorage on first empty DB. */
export async function fetchChatStoreFromApi(): Promise<ChatStoreData> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    CHAT_STORE_FETCH_TIMEOUT_MS,
  );
  try {
    const res = await fetch("/api/chat-store?scope=active", {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      const local = loadLocalStorageForMigration();
      if (chatStoreHasPersistedMessages(local)) {
        return normalizeLoadedStore(local);
      }
      throw new Error(`chat_store_load_failed:${res.status}`);
    }
    const payload = (await res.json()) as {
      ok?: boolean;
      empty?: boolean;
      store?: ChatStoreData | null;
      error?: string;
    };
    if (payload.ok === false) {
      const local = loadLocalStorageForMigration();
      if (chatStoreHasPersistedMessages(local)) {
        return normalizeLoadedStore(local);
      }
      throw new Error(payload.error ?? "chat_store_load_failed");
    }

    if (payload.store && chatStoreHasPersistedMessages(payload.store)) {
      const normalized = normalizeLoadedStore(payload.store);
      clientPersistedSnapshot = normalized;
      return normalized;
    }

    if (payload.empty) {
      const local = loadLocalStorageForMigration();
      if (chatStoreHasPersistedMessages(local)) {
        const migrated = await postMigrate(local);
        if (migrated) {
          clientPersistedSnapshot = migrated;
          return migrated;
        }
        const normalizedLocal = normalizeLoadedStore(local);
        clientPersistedSnapshot = normalizedLocal;
        return normalizedLocal;
      }
    }

    if (payload.store) {
      const normalized = normalizeLoadedStore(payload.store);
      clientPersistedSnapshot = normalized;
      return normalized;
    }
  } catch {
    /* fall through */
  } finally {
    window.clearTimeout(timeoutId);
  }
  return defaultChatStore();
}

type FlushApiSaveOptions = {
  /** Allow the PUT to finish after pagehide / window teardown. */
  keepalive?: boolean;
};

async function flushApiSave(options?: FlushApiSaveOptions): Promise<void> {
  apiSaveScheduled = false;
  const snapshot = pendingApiSave;
  pendingApiSave = null;
  if (!snapshot) return;

  const previous = clientPersistedSnapshot;
  const body = JSON.stringify({ ...snapshot, previous });
  try {
    const res = await fetch("/api/chat-store", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
      keepalive: options?.keepalive === true,
    });
    if (res.ok) {
      clientPersistedSnapshot = snapshot;
      return;
    }
  } catch {
    /* fall through to requeue */
  }
  // Keep the snapshot pending so a later flush (pagehide / app exit) retries,
  // unless a newer save was scheduled while this PUT was in flight.
  if (!pendingApiSave) {
    pendingApiSave = snapshot;
  }
}

export function scheduleSaveChatStoreViaApi(data: ChatStoreData): void {
  if (typeof window === "undefined") return;
  pendingApiSave = data;
  if (apiSaveScheduled) return;
  apiSaveScheduled = true;

  const run = () => {
    void flushApiSave();
  };

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 400 });
  } else {
    window.setTimeout(run, 0);
  }
}

export function flushPendingChatStoreApiSave(): void {
  void flushPendingChatStoreApiSaveAsync();
}

/** Await SQLite persistence (call before desktop shell tears down the Next server). */
export async function flushPendingChatStoreApiSaveAsync(
  options?: FlushApiSaveOptions,
): Promise<void> {
  if (!pendingApiSave && !apiSaveScheduled) return;
  apiSaveScheduled = false;
  await flushApiSave(options);
}

export async function fetchThreadMessagesFromApi(
  threadId: string,
  options?: { preferBackup?: boolean },
): Promise<import("@/lib/chat-types").AgentUIMessage[]> {
  const params = new URLSearchParams();
  if (options?.preferBackup) params.set("preferBackup", "1");
  const qs = params.toString();
  const url = `/api/chat-store/threads/${encodeURIComponent(threadId)}/messages${qs ? `?${qs}` : ""}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const payload = (await res.json()) as { messages?: unknown };
    return Array.isArray(payload.messages)
      ? (payload.messages as import("@/lib/chat-types").AgentUIMessage[])
      : [];
  } catch {
    return [];
  }
}
