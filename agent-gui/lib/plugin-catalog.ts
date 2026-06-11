import type { AppSettingsTabId } from "@/lib/app-settings-tabs";
import { CLIPBOARD_HISTORY_ENABLED } from "@/lib/clipboard-history/clipboard-history-config";

export type PluginCatalogAvailability = "available" | "disabled" | "coming-soon";

export type PluginCatalogEntry = {
  id: string;
  displayName: string;
  description: string;
  sizeHint: string | null;
  /** Settings tab for per-plugin configuration (after install). */
  settingsTab: AppSettingsTabId | null;
  availability: PluginCatalogAvailability;
};

const VOICE_ASR: PluginCatalogEntry = {
  id: "voice-asr",
  displayName: "本地语音输入",
  description:
    "Composer 内按住麦克风说话，识别文字写入输入框。音频与识别完全在本机完成。",
  sizeHint: "约 240 MB（含默认模型）",
  settingsTab: "voice",
  availability: "available",
};

const CLIPBOARD_HISTORY: PluginCatalogEntry = {
  id: "clipboard-history",
  displayName: "剪贴板历史",
  description:
    "采集系统剪贴板变更，提供搜索、置顶与写回。独立子进程，不影响系统剪贴板。",
  sizeHint: "约 12 MB",
  settingsTab: null,
  availability: CLIPBOARD_HISTORY_ENABLED ? "available" : "disabled",
};

/** Canonical plugin list for the settings catalog (order preserved). */
export const PLUGIN_CATALOG: readonly PluginCatalogEntry[] = [
  VOICE_ASR,
  CLIPBOARD_HISTORY,
];

export function findPluginCatalogEntry(pluginId: string): PluginCatalogEntry | null {
  return PLUGIN_CATALOG.find((entry) => entry.id === pluginId) ?? null;
}

export function isPluginCatalogActionable(entry: PluginCatalogEntry): boolean {
  return entry.availability === "available";
}
