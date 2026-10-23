"use client";

import { openLauncherWindow } from "@/lib/launcher/launcher-window";
import { isTauriShell } from "@/lib/tauri-shell";

/** Invoked when the configured global launcher shortcut is pressed. */
export async function dispatchLauncherShortcutPress(): Promise<void> {
  if (!isTauriShell()) return;
  await openLauncherWindow();
}
