"use client";

import { listenDesktop } from "@/lib/desktop-bridge";

let appWindowFocused =
  typeof document !== "undefined"
    ? document.visibilityState === "visible" && document.hasFocus()
    : true;
const listeners = new Set<() => void>();
let snapshotVersion = 0;

function setAppWindowFocused(next: boolean): void {
  if (appWindowFocused === next) return;
  appWindowFocused = next;
  snapshotVersion += 1;
  for (const listener of listeners) {
    listener();
  }
}

function syncFromDocument(): void {
  if (typeof document === "undefined") return;
  setAppWindowFocused(
    document.visibilityState === "visible" && document.hasFocus(),
  );
}

export function isAppWindowFocused(): boolean {
  return appWindowFocused;
}

export function subscribeAppWindowFocus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAppWindowFocusVersion(): number {
  return snapshotVersion;
}

/** Mount once near the app root to track focus in browser and Electron shells. */
export function initAppWindowFocusTracking(): () => void {
  if (typeof window === "undefined") return () => {};

  syncFromDocument();
  document.addEventListener("visibilitychange", syncFromDocument);
  window.addEventListener("focus", syncFromDocument);
  window.addEventListener("blur", syncFromDocument);

  let unlistenElectron: (() => void) | undefined;
  void listenDesktop("app-window-focus", (payload) => {
    if (typeof payload !== "object" || payload === null) return;
    const focused = (payload as { focused?: unknown }).focused;
    if (typeof focused === "boolean") {
      setAppWindowFocused(focused);
    }
  }).then((unlisten) => {
    unlistenElectron = unlisten;
  });

  return () => {
    document.removeEventListener("visibilitychange", syncFromDocument);
    window.removeEventListener("focus", syncFromDocument);
    window.removeEventListener("blur", syncFromDocument);
    unlistenElectron?.();
  };
}
