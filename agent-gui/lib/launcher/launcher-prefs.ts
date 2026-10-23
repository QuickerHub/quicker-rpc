export const LAUNCHER_SHORTCUT_STORAGE_KEY = "launcher-global-shortcut";

/** Default global shortcut for the quick-input launcher (Tauri). */
export const DEFAULT_LAUNCHER_SHORTCUT = "CommandOrControl+Shift+Space";

export const LAUNCHER_PREFS_CHANGED_EVENT = "launcher-prefs-changed";

export function loadLauncherShortcut(): string {
  if (typeof window === "undefined") return DEFAULT_LAUNCHER_SHORTCUT;
  const stored = localStorage.getItem(LAUNCHER_SHORTCUT_STORAGE_KEY)?.trim();
  return stored || DEFAULT_LAUNCHER_SHORTCUT;
}

export function storeLauncherShortcut(shortcut: string): void {
  localStorage.setItem(LAUNCHER_SHORTCUT_STORAGE_KEY, shortcut.trim());
  window.dispatchEvent(new Event(LAUNCHER_PREFS_CHANGED_EVENT));
}
