"use client";

import { invokeDesktop } from "@/lib/desktop-bridge";
import { isDesktopShell } from "@/lib/desktop-shell";
import {
  isLauncherAutoVoiceEnabled,
  loadLauncherShortcut,
} from "@/lib/launcher/launcher-prefs";
import { isValidTauriShortcut } from "@/lib/launcher/launcher-shortcut-format";

let syncTail: Promise<void> = Promise.resolve();

export type LauncherShortcutSyncResult = {
  ok: boolean;
  shortcut: string;
  error?: string;
};

function enqueueShortcutOp<T>(operation: () => Promise<T>): Promise<T> {
  const run = syncTail.then(operation, operation);
  syncTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function syncLauncherGlobalShortcutInner(): Promise<LauncherShortcutSyncResult> {
  const shortcut = loadLauncherShortcut();
  const autoVoice = isLauncherAutoVoiceEnabled();
  if (!isDesktopShell()) {
    return { ok: true, shortcut };
  }
  if (!isValidTauriShortcut(shortcut)) {
    return { ok: false, shortcut, error: "快捷键格式无效" };
  }

  try {
    await invokeDesktop("launcher_sync_global_shortcut", { shortcut, autoVoice });
    return { ok: true, shortcut };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, shortcut, error: message };
  }
}

export function syncLauncherGlobalShortcut(): Promise<LauncherShortcutSyncResult> {
  return enqueueShortcutOp(syncLauncherGlobalShortcutInner);
}

export function unregisterLauncherGlobalShortcut(): Promise<void> {
  return Promise.resolve();
}
