"use client";

import { useEffect } from "react";
import { syncElectronTitleBarOverlay } from "@/lib/electron-titlebar-overlay";

/** Keeps Electron WCO caption buttons aligned with the themed custom titlebar. */
export function ElectronTitlebarOverlaySync() {
  useEffect(() => {
    void syncElectronTitleBarOverlay();

    const onThemeChange = () => {
      void syncElectronTitleBarOverlay();
    };

    window.addEventListener("agent-gui-theme-change", onThemeChange);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", onThemeChange);

    return () => {
      window.removeEventListener("agent-gui-theme-change", onThemeChange);
      media.removeEventListener("change", onThemeChange);
    };
  }, []);

  return null;
}
