"use client";

import { loadLauncherShortcut } from "@/lib/launcher/launcher-prefs";
import { dispatchLauncherShortcutPress } from "@/lib/launcher/launcher-shortcut-action";
import { isValidTauriShortcut } from "@/lib/launcher/launcher-shortcut-format";
import { isTauriShell } from "@/lib/tauri-shell";

let registeredShortcut: string | null = null;

export type LauncherShortcutSyncResult = {
  ok: boolean;
  shortcut: string;
  error?: string;
};

export async function syncLauncherGlobalShortcut(): Promise<LauncherShortcutSyncResult> {
  const shortcut = loadLauncherShortcut();
  if (!isTauriShell()) {
    return { ok: true, shortcut };
  }
  if (!isValidTauriShortcut(shortcut)) {
    return { ok: false, shortcut, error: "快捷键格式无效" };
  }

  const { register, unregister, isRegistered } = await import(
    "@tauri-apps/plugin-global-shortcut"
  );

  if (registeredShortcut && registeredShortcut !== shortcut) {
    try {
      if (await isRegistered(registeredShortcut)) {
        await unregister(registeredShortcut);
      }
    } catch {
      // best-effort cleanup
    }
    registeredShortcut = null;
  }

  if (registeredShortcut === shortcut) {
    return { ok: true, shortcut };
  }

  try {
    if (await isRegistered(shortcut)) {
      await unregister(shortcut);
    }
    await register(shortcut, (event) => {
      if (event.state !== "Pressed") return;
      void dispatchLauncherShortcutPress();
    });
    registeredShortcut = shortcut;
    return { ok: true, shortcut };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, shortcut, error: message };
  }
}

export async function unregisterLauncherGlobalShortcut(): Promise<void> {
  if (!isTauriShell() || !registeredShortcut) return;
  try {
    const { unregister, isRegistered } = await import(
      "@tauri-apps/plugin-global-shortcut"
    );
    if (await isRegistered(registeredShortcut)) {
      await unregister(registeredShortcut);
    }
  } catch {
    // ignore teardown errors
  }
  registeredShortcut = null;
}
