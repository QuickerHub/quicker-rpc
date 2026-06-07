/** Launcher agent (/api/chat chatMode=launcher) test prompts. */

export type LauncherAgentScenario = {
  id: string;
  label: string;
  description: string;
  userPrompt: string;
  /** Expected first tool (optional assertion hint for testers). */
  expectTool?: string;
};

export const LAUNCHER_AGENT_SCENARIOS: readonly LauncherAgentScenario[] = [
  {
    id: "open-hotkeys",
    label: "打开功能快捷键",
    description: "应先 launcher_resolve，再 quicker_settings open",
    userPrompt: "打开功能快捷键设置",
    expectTool: "launcher_resolve",
  },
  {
    id: "open-recycle-bin",
    label: "动作回收站",
    description: "设置页 intent → open preset/page",
    userPrompt: "帮我打开动作回收站",
    expectTool: "launcher_resolve",
  },
  {
    id: "open-search",
    label: "Quicker 搜索",
    description: "open-search intent",
    userPrompt: "打开 Quicker 搜索",
    expectTool: "launcher_resolve",
  },
  {
    id: "open-general",
    label: "基本选项",
    description: "常规/BasicInfo 设置页",
    userPrompt: "打开基本选项",
    expectTool: "launcher_resolve",
  },
  {
    id: "run-action-vague",
    label: "运行动作（模糊）",
    description: "resolve 后应倾向 action run",
    userPrompt: "运行剪贴板相关动作",
    expectTool: "launcher_resolve",
  },
];

export function getLauncherAgentScenario(id: string): LauncherAgentScenario | undefined {
  return LAUNCHER_AGENT_SCENARIOS.find((s) => s.id === id);
}

export function getDefaultLauncherAgentScenario(): LauncherAgentScenario {
  return LAUNCHER_AGENT_SCENARIOS[0]!;
}
