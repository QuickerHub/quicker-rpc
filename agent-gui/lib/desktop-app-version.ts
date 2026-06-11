"use client";

import { invokeDesktop } from "@/lib/desktop-bridge";
import { isDesktopShell, isElectronShell, isTauriShell } from "@/lib/desktop-shell";

/** Installed desktop app version (Tauri or Electron release build). */
export async function getDesktopAppVersion(): Promise<string> {
  if (isElectronShell()) {
    try {
      const version = await invokeDesktop<string>("app_get_version");
      return String(version ?? "").trim();
    } catch {
      return "";
    }
  }
  if (isTauriShell()) {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      return (await getVersion()).trim();
    } catch {
      return "";
    }
  }
  return "";
}

export function desktopAppVersionAvailable(): boolean {
  return isDesktopShell();
}
