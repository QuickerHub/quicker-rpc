"use client";

import { useEffect } from "react";
import { LAUNCHER_PREFS_CHANGED_EVENT } from "@/lib/launcher/launcher-prefs";
import { isLauncherRoute } from "@/lib/launcher/launcher-window";
import {
  syncLauncherGlobalShortcut,
  unregisterLauncherGlobalShortcut,
} from "@/lib/launcher/sync-launcher-global-shortcut";
import { isTauriShell } from "@/lib/tauri-shell";

/** Register the launcher global shortcut from the main webview (Tauri only). */
export function useLauncherGlobalShortcut(): void {
  useEffect(() => {
    if (!isTauriShell() || isLauncherRoute()) return;

    let disposed = false;

    const sync = () => {
      if (disposed) return;
      void syncLauncherGlobalShortcut().then((result) => {
        if (!result.ok && !disposed) {
          console.warn("[launcher] global shortcut sync failed:", result.error);
        }
      });
    };

    sync();
    window.addEventListener(LAUNCHER_PREFS_CHANGED_EVENT, sync);

    return () => {
      disposed = true;
      window.removeEventListener(LAUNCHER_PREFS_CHANGED_EVENT, sync);
      void unregisterLauncherGlobalShortcut();
    };
  }, []);
}
