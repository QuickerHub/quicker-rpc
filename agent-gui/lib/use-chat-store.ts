"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ChatStoreData } from "@/lib/chat-store";
import {
  CHAT_STORAGE_KEY,
  defaultChatStore,
  loadChatStore,
  saveChatStore,
} from "@/lib/chat-store";

let cachedStore: ChatStoreData | undefined;

/** Stable reference for SSR / hydration (must not allocate per call). */
let serverSnapshot: ChatStoreData | undefined;

function getChatStoreSnapshot(): ChatStoreData {
  if (typeof window === "undefined") {
    return getChatStoreServerSnapshot();
  }
  if (!cachedStore) {
    try {
      cachedStore = loadChatStore();
    } catch {
      cachedStore = defaultChatStore();
    }
  }
  return cachedStore;
}

function getChatStoreServerSnapshot(): ChatStoreData {
  if (!serverSnapshot) {
    serverSnapshot = defaultChatStore();
  }
  return serverSnapshot;
}

const listeners = new Set<() => void>();

function subscribeChatStore(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === CHAT_STORAGE_KEY) {
      cachedStore = undefined;
      onStoreChange();
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

  const [defaultCwd, setDefaultCwd] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings/default-cwd", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { cwd?: string };
        if (cancelled) return;
        if (typeof data.cwd === "string") {
          setDefaultCwd(data.cwd);
        }
      } catch {
        /* optional default cwd */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateStore = useCallback((next: ChatStoreData) => {
    saveChatStore(next);
    cachedStore = next;
    notifyChatStoreListeners();
  }, []);

  return { store, defaultCwd, updateStore };
}
