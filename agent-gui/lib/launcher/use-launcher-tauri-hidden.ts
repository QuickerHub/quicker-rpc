"use client";

import { useEffect } from "react";
import { listenDesktop } from "@/lib/desktop-bridge";
import { postLauncherSessionClear } from "@/lib/launcher/launcher-bridge";
import { LAUNCHER_HIDDEN_EVENT } from "@/lib/launcher/launcher-tauri-events";
import { isLauncherDesktopWindow } from "@/lib/launcher/launcher-window-tauri";
import { isDesktopShell } from "@/lib/desktop-shell";

type UseLauncherTauriHiddenOptions = {
  onHidden?: () => void;
};

/** React to the desktop shell hiding the launcher window (focus loss, programmatic hide). */
export function useLauncherTauriHidden({
  onHidden,
}: UseLauncherTauriHiddenOptions = {}): void {
  useEffect(() => {
    if (!isDesktopShell()) return;

    let unlisten: (() => void) | undefined;
    let disposed = false;

    void (async () => {
      if (!(await isLauncherDesktopWindow())) return;
      if (disposed) return;

      unlisten = await listenDesktop(LAUNCHER_HIDDEN_EVENT, () => {
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
