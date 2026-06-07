"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { DefaultWorkingDirectoryProfile } from "@/lib/default-working-directory";
import type { ChatStoreData } from "@/lib/chat-store";
import {
  CHAT_STORAGE_KEY,
  defaultChatStore,
  flushPendingChatStoreSave,
  loadChatStore,
  scheduleSaveChatStore,
} from "@/lib/chat-store";

let cachedStore: ChatStoreData | undefined;

/** Stable reference for SSR / hydration (must not allocate per call). */
let serverSnapshot: ChatStoreData | undefined;

/** Until true, client getSnapshot matches getServerSnapshot (React hydration rule). */
let storeHydrated = false;

function readChatStoreFromClient(): ChatStoreData {
  try {
    return loadChatStore();
  } catch {
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
    cachedStore = readChatStoreFromClient();
  }
  return cachedStore;
}

function getChatStoreServerSnapshot(): ChatStoreData {
  if (!serverSnapshot) {
    serverSnapshot = defaultChatStore();
  }
  return serverSnapshot;
}

function hydrateChatStoreFromClient(): void {
  if (storeHydrated) return;
  storeHydrated = true;
  cachedStore = readChatStoreFromClient();
  notifyChatStoreListeners();
}

/** Eagerly load persisted chat store during boot splash dismiss. */
export function ensureChatStoreHydrated(): void {
  hydrateChatStoreFromClient();
}

const listeners = new Set<() => void>();

function subscribeChatStore(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === CHAT_STORAGE_KEY) {
      cachedStore = undefined;
      if (storeHydrated) {
        onStoreChange();
      }
    }
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

  useEffect(() => {
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

  const updateStore = useCallback((next: ChatStoreData) => {
    if (next === cachedStore) return;
    scheduleSaveChatStore(next);
    cachedStore = next;
    notifyChatStoreListeners();
  }, []);

  useEffect(() => {
    const onPageHide = () => flushPendingChatStoreSave();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flushPendingChatStoreSave();
    };
  }, []);

  return { store, defaultCwd, defaultCwdProfile, defaultCwdReady, updateStore };
}
