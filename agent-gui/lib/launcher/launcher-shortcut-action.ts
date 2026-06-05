"use client";

import { GLOBAL_VOICE_TOGGLE_EVENT } from "@/lib/voice-input/use-global-voice-toggle";
import { isLauncherAutoVoiceEnabled } from "@/lib/launcher/launcher-prefs";
import { openLauncherWindow } from "@/lib/launcher/launcher-window";
import { isTauriShell } from "@/lib/tauri-shell";

async function emitVoiceToggleToLauncher(): Promise<void> {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const launcher = await WebviewWindow.getByLabel("launcher");
  if (!launcher) return;
  await new Promise((resolve) => window.setTimeout(resolve, 80));
  await launcher.emit(GLOBAL_VOICE_TOGGLE_EVENT, {});
}

/** Invoked when the configured global launcher shortcut is pressed. */
export async function dispatchLauncherShortcutPress(): Promise<void> {
  if (!isTauriShell()) return;
  openLauncherWindow();
  if (isLauncherAutoVoiceEnabled()) {
    await emitVoiceToggleToLauncher();
  }
}
