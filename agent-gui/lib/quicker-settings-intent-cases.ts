/** Golden cases for Quicker settings intent resolution (/tool-test → 启动). */

export type SettingsIntentExpect = {
  intent: string;
  pageId?: string;
  presetId?: string;
  settingKey?: string;
  target?: string;
};

export type SettingsIntentCase = {
  id: string;
  label: string;
  description?: string;
  /** User utterance passed to settings resolve --query (default). */
  utterance: string;
  /** How to call settings resolve (default query). */
  resolveVia?: "query" | "preset" | "key";
  expect: SettingsIntentExpect;
};

export type SettingsIntentCaseGroup = {
  id: string;
  label: string;
  cases: readonly SettingsIntentCase[];
};

export const DEFAULT_SETTINGS_INTENT_CASE_ID = "open-recycle-bin";

export const SETTINGS_INTENT_CASE_GROUPS: readonly SettingsIntentCaseGroup[] = [
  {
    id: "open-ui",
    label: "打开设置页",
    cases: [
      {
        id: "open-recycle-bin",
        label: "动作回收站",
        description: "常见口语：打开回收站",
        utterance: "帮我打开动作回收站",
        expect: {
          intent: "open-ui",
          pageId: "ActionRecycleBinSettingPage",
        },
      },
      {
        id: "open-hotkeys",
        label: "功能快捷键",
        utterance: "打开功能快捷键设置",
        expect: {
          intent: "open-ui",
          pageId: "FunctionHotkeys",
        },
      },
      {
        id: "open-circle-menu",
        label: "轮盘菜单",
        utterance: "打开轮盘菜单设置",
        expect: {
          intent: "open-ui",
          pageId: "CircleMenuSettingPage",
        },
      },
      {
        id: "open-ui-settings",
        label: "面板窗口",
        utterance: "面板窗口设置",
        expect: {
          intent: "open-ui",
          pageId: "UISettingsPage",
        },
      },
      {
        id: "open-gestures",
        label: "鼠标手势",
        utterance: "鼠标手势设置",
        expect: {
          intent: "open-ui",
          pageId: "GesturesSettingPage",
        },
      },
      {
        id: "open-batch-update",
        label: "批量更新动作",
        utterance: "批量更新动作",
        expect: {
          intent: "open-ui",
          pageId: "UpdateActionsPage",
        },
      },
      {
        id: "open-about",
        label: "关于 Quicker",
        utterance: "关于",
        expect: {
          intent: "open-ui",
          pageId: "AboutSettingPage",
        },
      },
      {
        id: "open-general",
        label: "常规设置",
        utterance: "打开基本选项",
        expect: {
          intent: "open-ui",
          pageId: "BasicInfo",
        },
      },
    ],
  },
  {
    id: "open-search",
    label: "搜索窗口",
    cases: [
      {
        id: "open-search-window",
        label: "Quicker 搜索",
        utterance: "打开 Quicker 搜索",
        expect: {
          intent: "open-search",
          target: "search",
        },
      },
    ],
  },
  {
    id: "preset",
    label: "直链 preset",
    cases: [
      {
        id: "preset-recycle-bin",
        label: "preset 回收站",
        utterance: "recycle-bin",
        resolveVia: "preset",
        expect: {
          intent: "open-ui",
          pageId: "ActionRecycleBinSettingPage",
          presetId: "recycle-bin",
        },
      },
    ],
  },
  {
    id: "setting-page",
    label: "按设置项定位页",
    cases: [
      {
        id: "key-circle-menu",
        label: "圆圈菜单开关所在页",
        utterance: "userSettings:EnableCircleMenu",
        resolveVia: "key",
        expect: {
          intent: "open-ui",
          pageId: "CircleMenuSettingPage",
          settingKey: "userSettings:EnableCircleMenu",
        },
      },
    ],
  },
];

export function getDefaultSettingsIntentCase(): SettingsIntentCase {
  for (const group of SETTINGS_INTENT_CASE_GROUPS) {
    const found = group.cases.find((c) => c.id === DEFAULT_SETTINGS_INTENT_CASE_ID);
    if (found) return found;
  }
  return SETTINGS_INTENT_CASE_GROUPS[0]!.cases[0]!;
}

export function flattenSettingsIntentCases(): SettingsIntentCase[] {
  return SETTINGS_INTENT_CASE_GROUPS.flatMap((g) => [...g.cases]);
}
