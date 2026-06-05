"use client";

import { useEffect } from "react";
import { postLauncherSessionClear } from "@/lib/launcher/launcher-bridge";
import { LAUNCHER_HIDDEN_EVENT } from "@/lib/launcher/launcher-tauri-events";
import { isTauriShell } from "@/lib/tauri-shell";

type UseLauncherTauriHiddenOptions = {
  onHidden?: () => void;
};

/** React to Rust hiding the launcher window (focus loss, programmatic hide). */
export function useLauncherTauriHidden({
  onHidden,
}: UseLauncherTauriHiddenOptions = {}): void {
  useEffect(() => {
    if (!isTauriShell()) return;

    let unlisten: (() => void) | undefined;
    let disposed = false;

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      if (disposed) return;
      if (getCurrentWindow().label !== "launcher") return;

      const { listen } = await import("@tauri-apps/api/event");
      if (disposed) return;

      unlisten = await listen(LAUNCHER_HIDDEN_EVENT, () => {
        postLauncherSessionClear();
        onHidden?.();
      });
    })();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onHidden]);
}
