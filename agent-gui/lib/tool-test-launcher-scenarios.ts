/** Launcher agent (/api/chat chatMode=launcher) test prompts. */

import type { LauncherEvalExpect } from "@/lib/agent-eval/launcher-expect";

export type LauncherAgentScenario = {
  id: string;
  label: string;
  description: string;
  userPrompt: string;
  /** Outcome rubric aligned with agent-gui-scenarios.json launcher block. */
  expectLauncher: LauncherEvalExpect;
};

export const LAUNCHER_AGENT_SCENARIOS: readonly LauncherAgentScenario[] = [
  {
    id: "open-hotkeys",
    label: "打开功能快捷键",
    description: "cache / resolve-direct / LLM 均可；结果应打开 FunctionHotkeys",
    userPrompt: "打开功能快捷键设置",
    expectLauncher: {
      intent: "open-settings",
      settingsOpen: { page: "FunctionHotkeys" },
    },
  },
  {
    id: "open-recycle-bin",
    label: "动作回收站",
    description: "设置页 recycle-bin（page 或 preset）",
    userPrompt: "帮我打开动作回收站",
    expectLauncher: {
      intent: "open-settings",
      settingsOpen: { page: "recycle-bin" },
    },
  },
  {
    id: "open-search",
    label: "Quicker 搜索",
    description: "open-search intent → quicker_settings",
    userPrompt: "打开 Quicker 搜索",
    expectLauncher: {
      intent: "open-search",
      settingsOpen: { intent: "open-search" },
    },
  },
  {
    id: "open-general",
    label: "基本选项",
    description: "常规/BasicInfo 设置页",
    userPrompt: "打开基本选项",
    expectLauncher: {
      intent: "open-settings",
      settingsOpen: { page: "BasicInfo" },
    },
  },
  {
    id: "run-action-vague",
    label: "运行动作（模糊）",
    description: "允许 resolve / query / run / ask_question 任一规划或执行步",
    userPrompt: "运行剪贴板相关动作",
    expectLauncher: {
      intent: "run-action",
    },
  },
];

export function getLauncherAgentScenario(id: string): LauncherAgentScenario | undefined {
  return LAUNCHER_AGENT_SCENARIOS.find((s) => s.id === id);
}

export function getDefaultLauncherAgentScenario(): LauncherAgentScenario {
  return LAUNCHER_AGENT_SCENARIOS[0]!;
}
