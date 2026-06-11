import { globalShortcut } from "../electron-api.mjs";

export const DEFAULT_LAUNCHER_SHORTCUT = "Alt+Space";

/**
 * @param {{
 *   onLauncherShortcutPress: () => void,
 * }} deps
 */
export function createGlobalShortcutCommands(deps) {
  let currentShortcut = DEFAULT_LAUNCHER_SHORTCUT;
  let autoVoice = false;

  function unregisterCurrent() {
    if (globalShortcut.isRegistered(currentShortcut)) {
      globalShortcut.unregister(currentShortcut);
    }
  }

  function registerShortcut(shortcut) {
    if (globalShortcut.isRegistered(shortcut)) {
      globalShortcut.unregister(shortcut);
    }
    const ok = globalShortcut.register(shortcut, () => {
      deps.onLauncherShortcutPress();
    });
    if (!ok) {
      throw new Error(`register failed: ${shortcut}`);
    }
  }

  function initDefault() {
    try {
      registerShortcut(DEFAULT_LAUNCHER_SHORTCUT);
      currentShortcut = DEFAULT_LAUNCHER_SHORTCUT;
    } catch (err) {
      console.error("[launcher-shortcut] default register failed:", err);
    }
  }

  return {
    getAutoVoice: () => autoVoice,
    initDefault,
    unregisterAll() {
      globalShortcut.unregisterAll();
    },
    launcher_sync_global_shortcut(args) {
      const trimmed = String(args?.shortcut ?? "").trim();
      if (!trimmed) {
        throw new Error("shortcut cannot be empty");
      }

      if (typeof args?.autoVoice === "boolean") {
        autoVoice = args.autoVoice;
      }

      if (trimmed === currentShortcut) {
        return null;
      }

      unregisterCurrent();
      registerShortcut(trimmed);
      currentShortcut = trimmed;
      return null;
    },
  };
}
