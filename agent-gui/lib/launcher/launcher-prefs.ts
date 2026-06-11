export const LAUNCHER_SHORTCUT_STORAGE_KEY = "launcher-global-shortcut";
export const LAUNCHER_AUTO_VOICE_STORAGE_KEY = "launcher-auto-voice";

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

export function isLauncherAutoVoiceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(LAUNCHER_AUTO_VOICE_STORAGE_KEY) === "1";
}

export function setLauncherAutoVoiceEnabled(enabled: boolean): void {
  localStorage.setItem(LAUNCHER_AUTO_VOICE_STORAGE_KEY, enabled ? "1" : "0");
  window.dispatchEvent(new Event(LAUNCHER_PREFS_CHANGED_EVENT));
}
