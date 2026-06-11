export const APP_SETTINGS_TABS = [
  { id: "general", label: "通用" },
  { id: "models", label: "模型" },
  { id: "plugins", label: "插件" },
  { id: "voice", label: "语音" },
  { id: "launcher", label: "启动器" },
] as const;

export type AppSettingsTabId = (typeof APP_SETTINGS_TABS)[number]["id"];

export const DEFAULT_APP_SETTINGS_TAB: AppSettingsTabId = "general";
