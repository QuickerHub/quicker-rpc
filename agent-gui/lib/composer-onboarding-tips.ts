export type ComposerOnboardingTipAction =
  | "try-mention"
  | "focus-composer"
  | "open-settings"
  | "toggle-explorer";

export type ComposerOnboardingTip = {
  id: string;
  label: string;
  hint: string;
  action: ComposerOnboardingTipAction;
};

/** First-run hints shown above the composer on an empty thread. */
export const COMPOSER_ONBOARDING_TIPS: readonly ComposerOnboardingTip[] = [
  {
    id: "mention",
    label: "@ 引用动作",
    hint: "输入 @ 搜索 Quicker 动作并插入标签",
    action: "try-mention",
  },
  {
    id: "describe",
    label: "描述任务",
    hint: "用自然语言说明你想创建或修改什么",
    action: "focus-composer",
  },
  {
    id: "settings",
    label: "配置模型",
    hint: "首次使用前在设置里添加 LLM",
    action: "open-settings",
  },
  {
    id: "explorer",
    label: "查看工程",
    hint: "打开资源面板浏览动作与子程序",
    action: "toggle-explorer",
  },
] as const;
