"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { DefaultWorkingDirectoryProfile } from "@/lib/default-working-directory";
import type { ChatStoreData } from "@/lib/chat-store";
import { fetchChatStoreFromApi } from "@/lib/chat-store-api.client";
import { getChatStorePersistenceMode } from "@/lib/chat-store-backend";
import { maybeAutoRestoreChatStoreOnBoot } from "@/lib/chat-store-boot-restore";
import {
  actionDesignerRefFromEmbed,
  focusActionDesignerInStore,
} from "@/lib/action-designer-thread";
import {
  isActionDesignerEmbedClient,
  parseActionDesignerEmbedFromSearchParams,
  resolveDesignerEmbedChatStorageKey,
} from "@/lib/action-designer-embed";
import {
  CHAT_STORAGE_KEY,
  CHAT_THREAD_KEY_PREFIX,
  chatStoreHasPersistedMessages,
  defaultChatStore,
  flushPendingChatStoreSave,
  flushPendingChatStoreSaveAsync,
  loadChatStoreFromLocalStorage,
  normalizeLoadedStore,
  scheduleSaveChatStore,
} from "@/lib/chat-store";
import { loadPersistedChatStore } from "@/lib/chat-store-persist";

let cachedStore: ChatStoreData | undefined;

/** Stable reference for SSR / hydration (must not allocate per call). */
let serverSnapshot: ChatStoreData | undefined;

/** Until true, client getSnapshot matches getServerSnapshot (React hydration rule). */
let storeHydrated = false;

async function readChatStoreFromClient(): Promise<ChatStoreData> {
  try {
    if (getChatStorePersistenceMode() === "api") {
      return await fetchChatStoreFromApi();
    }
    return loadChatStoreFromLocalStorage();
  } catch {
    try {
      const local = loadChatStoreFromLocalStorage();
      if (local.threads.length > 0) {
        return local;
      }
    } catch {
      /* ignore */
    }
    return defaultChatStore();
  }
}

function getChatStoreSnapshot(): ChatStoreData {
  if (typeof window === "undefined") {
    return getChatStoreServerSnapshot();
  }
  if (!storeHydrated) {
    return getChatStoreServerSnapshot();
  }
  if (!cachedStore) {
    return getChatStoreServerSnapshot();
  }
  return cachedStore;
}

function getChatStoreServerSnapshot(): ChatStoreData {
  if (!serverSnapshot) {
    serverSnapshot = defaultChatStore();
  }
  return serverSnapshot;
}

let hydrationInFlight = false;

function loadDesignerEmbedStoreFromLocalStorage(
  designerRef: ReturnType<typeof actionDesignerRefFromEmbed>,
): ChatStoreData {
  const designerKey = resolveDesignerEmbedChatStorageKey();
  let local = loadChatStoreFromLocalStorage();
  if (
    designerKey
    && designerKey !== CHAT_STORAGE_KEY
    && !chatStoreHasPersistedMessages(local)
    && designerRef
  ) {
    const legacy = loadPersistedChatStore({
      messageScope: "active",
      storageKey: CHAT_STORAGE_KEY,
    });
    if (legacy && chatStoreHasPersistedMessages(legacy)) {
      local = legacy;
    }
  }
  return normalizeLoadedStore(
    local.threads.length > 0 ? local : defaultChatStore(),
  );
}

function reloadChatStoreFromStorage(): void {
  if (!storeHydrated || typeof window === "undefined") return;
  if (isActionDesignerEmbedClient()) {
    hydrateDesignerEmbedStore();
    return;
  }
  void (async () => {
    try {
      cachedStore = normalizeLoadedStore(await readChatStoreFromClient());
    } catch {
      try {
        cachedStore = normalizeLoadedStore(loadChatStoreFromLocalStorage());
      } catch {
        if (!cachedStore) {
          cachedStore = defaultChatStore();
        }
      }
    }
    notifyChatStoreListeners();
  })();
}

function isExternalChatStoreStorageKey(key: string | null): boolean {
  if (!key) return false;
  if (
    key === CHAT_STORAGE_KEY
    || key === `${CHAT_STORAGE_KEY}-backup`
    || key.startsWith(CHAT_THREAD_KEY_PREFIX)
  ) {
    return true;
  }
  const activeKey = resolveDesignerEmbedChatStorageKey();
  if (activeKey) {
    if (key === activeKey || key === `${activeKey}-backup`) return true;
  }
  return key.startsWith("agent-gui-chats-designer-");
}

function hydrateDesignerEmbedStore(): void {
  const embed = parseActionDesignerEmbedFromSearchParams(
    new URLSearchParams(window.location.search),
  );
  const designerRef = actionDesignerRefFromEmbed(embed);
  try {
    let store = loadDesignerEmbedStoreFromLocalStorage(designerRef);
    if (designerRef) {
      store = focusActionDesignerInStore(store, designerRef);
    }
    cachedStore = store;
  } catch {
    cachedStore = designerRef
      ? focusActionDesignerInStore(defaultChatStore(), designerRef)
      : defaultChatStore();
  }
  storeHydrated = true;
  hydrationInFlight = false;
  notifyChatStoreListeners();
}

function hydrateChatStoreFromClient(): void {
  if (storeHydrated || hydrationInFlight) return;
  if (isActionDesignerEmbedClient()) {
    hydrationInFlight = true;
    hydrateDesignerEmbedStore();
    return;
  }
  hydrationInFlight = true;
  void (async () => {
    try {
      cachedStore = normalizeLoadedStore(await readChatStoreFromClient());
    } finally {
      hydrationInFlight = false;
    }
    storeHydrated = true;
    notifyChatStoreListeners();
    startBootAutoRestoreIfNeeded();
  })();
}

let bootAutoRestoreStarted = false;

function startBootAutoRestoreIfNeeded(): void {
  if (bootAutoRestoreStarted || typeof window === "undefined") return;
  // Auto-restore merges legacy data over the current store; it must only run
  // against the real hydrated store, never a throwaway default snapshot.
  if (!storeHydrated || !cachedStore) return;
  bootAutoRestoreStarted = true;
  const snapshot = cachedStore;
  void maybeAutoRestoreChatStoreOnBoot(snapshot).then((restored) => {
    if (!restored) return;
    cachedStore = normalizeLoadedStore(restored);
    notifyChatStoreListeners();
  });
}

/** Eagerly load persisted chat store during boot splash dismiss. */
export function ensureChatStoreHydrated(): void {
  hydrateChatStoreFromClient();
  startBootAutoRestoreIfNeeded();
}

/** Whether localStorage has been read (safe to mount ChatPanel / persist). */
export function isChatStoreHydrated(): boolean {
  return storeHydrated;
}

/** Latest store after updateStore (safe between React renders during rapid tab switches). */
export function getChatStoreSnapshotSync(): ChatStoreData {
  return getChatStoreSnapshot();
}

function getHydrationSnapshot(): boolean {
  return storeHydrated;
}

function getHydrationServerSnapshot(): boolean {
  return false;
}

/** Subscribe to chat-store hydration completing (false until localStorage is read). */
export function useIsChatStoreHydrated(): boolean {
  return useSyncExternalStore(
    subscribeChatStore,
    getHydrationSnapshot,
    getHydrationServerSnapshot,
  );
}

const listeners = new Set<() => void>();

function subscribeChatStore(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  const onStorage = (event: StorageEvent) => {
    if (!isExternalChatStoreStorageKey(event.key)) return;
    reloadChatStoreFromStorage();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function notifyChatStoreListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function useChatStore() {
  const store = useSyncExternalStore(
    subscribeChatStore,
    getChatStoreSnapshot,
    getChatStoreServerSnapshot,
  );

  // useLayoutEffect: hydrate before ChatPanel useEffect persist timers fire.
  useLayoutEffect(() => {
    hydrateChatStoreFromClient();
  }, []);

  const [defaultCwd, setDefaultCwd] = useState("");
  const [defaultCwdProfile, setDefaultCwdProfile] =
    useState<DefaultWorkingDirectoryProfile>("documents");
  const [defaultCwdReady, setDefaultCwdReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings/default-cwd", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          cwd?: string;
          profile?: DefaultWorkingDirectoryProfile;
        };
        if (cancelled) return;
        if (typeof data.cwd === "string") {
          setDefaultCwd(data.cwd);
        }
        if (
          data.profile === "env"
          || data.profile === "repo"
          || data.profile === "documents"
        ) {
          setDefaultCwdProfile(data.profile);
        }
      } catch {
        /* optional default cwd */
      } finally {
        if (!cancelled) {
          setDefaultCwdReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateStore = useCallback(
    (next: ChatStoreData, options?: { notify?: boolean }) => {
      let normalized = normalizeLoadedStore(next);
      if (typeof window !== "undefined" && isActionDesignerEmbedClient()) {
        const designerRef = actionDesignerRefFromEmbed(
          parseActionDesignerEmbedFromSearchParams(
            new URLSearchParams(window.location.search),
          ),
        );
        if (designerRef) {
          normalized = focusActionDesignerInStore(normalized, designerRef);
        }
      }
      if (normalized === cachedStore) return;
      scheduleSaveChatStore(normalized);
      cachedStore = normalized;
      if (options?.notify !== false) {
        notifyChatStoreListeners();
      }
    },
    [],
  );

  useEffect(() => {
    const onPageHide = () => {
      void flushPendingChatStoreSaveAsync({ keepalive: true });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      void flushPendingChatStoreSaveAsync({ keepalive: true });
    };
  }, []);

  return { store, defaultCwd, defaultCwdProfile, defaultCwdReady, updateStore };
}
