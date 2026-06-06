"use client";

import { loadLauncherShortcut } from "@/lib/launcher/launcher-prefs";
import { dispatchLauncherShortcutPress } from "@/lib/launcher/launcher-shortcut-action";
import { isValidTauriShortcut } from "@/lib/launcher/launcher-shortcut-format";
import { isTauriShell } from "@/lib/tauri-shell";

let registeredShortcut: string | null = null;
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

function isAlreadyRegisteredError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /already registered/i.test(message);
}

async function syncLauncherGlobalShortcutInner(): Promise<LauncherShortcutSyncResult> {
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
    if (isAlreadyRegisteredError(err) && (await isRegistered(shortcut))) {
      registeredShortcut = shortcut;
      return { ok: true, shortcut };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, shortcut, error: message };
  }
}

export function syncLauncherGlobalShortcut(): Promise<LauncherShortcutSyncResult> {
  return enqueueShortcutOp(syncLauncherGlobalShortcutInner);
}

async function unregisterLauncherGlobalShortcutInner(): Promise<void> {
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

export function unregisterLauncherGlobalShortcut(): Promise<void> {
  return enqueueShortcutOp(unregisterLauncherGlobalShortcutInner);
}
