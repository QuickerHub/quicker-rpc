import { CLIPBOARD_HISTORY_ENABLED, DISABLED_MESSAGE } from "../clipboard-history/constants.mjs";
import {
  clipboardHttpPort,
  ensureClipboardRuntime,
  fetchClipboardRuntimeHealth,
  shutdownClipboardHistory,
} from "../clipboard-history/runtime.mjs";
import { buildClipboardPluginStatus } from "../clipboard-history/status.mjs";
import {
  readClipboardAutoStart,
  readClipboardSettings,
  writeClipboardSettings,
} from "../clipboard-history/settings.mjs";

export function createClipboardHistoryCommands() {
  return {
    async clipboard_history_plugin_status() {
      return buildClipboardPluginStatus();
    },
    async clipboard_history_runtime_health() {
      const port = clipboardHttpPort();
      const ok = (await fetchClipboardRuntimeHealth(port)).ok;
      return {
        ok,
        ready: ok,
        protocolVersion: 1,
        httpPort: port,
      };
    },
    async clipboard_history_plugin_start_runtime() {
      if (!CLIPBOARD_HISTORY_ENABLED) {
        shutdownClipboardHistory();
        throw new Error(DISABLED_MESSAGE);
      }
      await ensureClipboardRuntime();
      return buildClipboardPluginStatus();
    },
    async clipboard_history_plugin_stop_runtime() {
      shutdownClipboardHistory();
      return buildClipboardPluginStatus();
    },
    clipboard_history_plugin_read_settings() {
      return readClipboardSettings();
    },
    clipboard_history_plugin_write_settings(args) {
      return writeClipboardSettings(args?.settings ?? {});
    },
  };
}

/** Background auto-start when enabled (matches Tauri `spawn_clipboard_runtime_background`). */
export function spawnClipboardRuntimeBackground() {
  if (!CLIPBOARD_HISTORY_ENABLED) return;
  if (!readClipboardAutoStart()) return;
  setImmediate(() => {
    ensureClipboardRuntime().catch((err) => {
      console.error("[clipboard-history] auto start failed:", err);
    });
  });
}
