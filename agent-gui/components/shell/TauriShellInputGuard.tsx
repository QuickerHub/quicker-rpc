"use client";

import { useEffect } from "react";
import { WORKSPACE_BROWSER_WEBVIEW_LABEL } from "@/lib/embedded-webview-label";
import { isTauriShell } from "@/lib/tauri-shell";

/** Recover clicks/focus in frameless WebView2 (orphan child webviews, stolen focus). */
export function TauriShellInputGuard() {
  useEffect(() => {
    if (!isTauriShell()) return;

    let disposed = false;

    const closeOrphanChildWebview = async () => {
      try {
        const { Webview } = await import("@tauri-apps/api/webview");
        const child = await Webview.getByLabel(WORKSPACE_BROWSER_WEBVIEW_LABEL);
        if (child) {
          await child.close();
        }
      } catch {
        // no child webview — expected
      }
    };

    const focusMainWindow = async () => {
      if (disposed) return;
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setFocus();
      } catch {
        // ignore
      }
    };

    void closeOrphanChildWebview().then(() => focusMainWindow());

    return () => {
      disposed = true;
    };
  }, []);

  return null;
}
