import type { ActionScopeHint } from "@/lib/action-scope";
import type { ChatMode } from "@/lib/chat-mode";
import { CHAT_MODE_ASK, CHAT_MODE_LAUNCHER } from "@/lib/chat-mode";

export type AgentTurnIntent =
  | "action_authoring"
  | "action_runtime"
  | "settings"
  | "web"
  | "workspace"
  | "conversation";

export type AgentTurnRisk = "read" | "write" | "destructive";

export type AgentTurnState = {
  intent: AgentTurnIntent;
  risk: AgentTurnRisk;
  targetRefs: string[];
  recommendedToolIds: string[];
  verificationHints: string[];
};

function hasAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function inferIntent(userText: string): AgentTurnIntent {
  const text = userText.toLowerCase();
  if (
    hasAny(text, [
      "创建动作",
      "新建动作",
      "修改动作",
      "编辑动作",
      "步骤",
      "step",
      "subprogram",
      "子程序",
      "workspace_program",
    ])
  ) {
    return "action_authoring";
  }
  if (
    hasAny(text, [
      "运行",
      "执行",
      "调试",
      "debug",
      "run",
      "trace",
      "报错",
      "失败",
    ])
  ) {
    return "action_runtime";
  }
  if (hasAny(text, ["设置", "配置", "快捷键", "模型", "llm", "api key"])) {
    return "settings";
  }
  if (hasAny(text, ["网页", "搜索", "浏览器", "网站", "http://", "https://", "web"])) {
    return "web";
  }
  if (hasAny(text, ["文件", "目录", "代码", "构建", "测试", "git", "diff"])) {
    return "workspace";
  }
  return "conversation";
}

function inferRisk(userText: string, enabledToolIds: readonly string[]): AgentTurnRisk {
  const text = userText.toLowerCase();
  if (
    hasAny(text, [
      "不要修改",
      "先不要修改",
      "不要写",
      "不要保存",
      "只读",
      "仅分析",
      "readonly",
      "read-only",
      "don't modify",
      "do not modify",
    ])
  ) {
    return "read";
  }
  if (hasAny(text, ["删除", "delete", "移除", "清空", "永久"])) {
    return "destructive";
  }
  if (
    hasAny(text, [
      "创建",
      "新建",
      "修改",
      "编辑",
      "写入",
      "保存",
      "移动",
      "发布",
      "配置",
      "设置",
      "运行",
      "执行",
      "调试",
      "build",
      "test",
    ])
  ) {
    return "write";
  }
  if (
    enabledToolIds.some((id) =>
      id === "Write"
      || id === "StrReplace"
      || id === "Shell"
      || id === "workspace_program"
      || id.startsWith("qkrpc_action_")
      || id.startsWith("qkrpc_subprogram_")
      || id.startsWith("quicker_")
    )
  ) {
    return "write";
  }
  return "read";
}

function verificationHintsForIntent(intent: AgentTurnIntent): string[] {
  switch (intent) {
    case "action_authoring":
      return ["After patching a program body, run workspace_program diagnostics."];
    case "action_runtime":
      return ["When output or failure details matter, prefer debug/trace over blind rerun."];
    case "settings":
      return ["Read current settings before writing and report the final applied value."];
    case "web":
      return ["Use web_search for current facts; use browser for interactive page state."];
    case "workspace":
      return ["Use focused file reads/search first; run the narrowest meaningful check after edits."];
    case "conversation":
      return ["Answer directly unless the user asks for local or current external state."];
  }
}

function preferredToolsForIntent(intent: AgentTurnIntent): string[] {
  switch (intent) {
    case "action_authoring":
      return [
        "docs",
        "qkrpc_action_query",
        "qkrpc_action_get",
        "qkrpc_step_runner_search",
        "qkrpc_step_runner_get",
        "workspace_program",
      ];
    case "action_runtime":
      return [
        "qkrpc_action_query",
        "qkrpc_action_run",
        "qkrpc_action_debug",
        "qkrpc_action_get",
        "qkrpc_wait",
      ];
    case "settings":
      return ["quicker_settings", "llm_settings", "ask_question"];
    case "web":
      return ["web_search", "browser", "user_browser"];
    case "workspace":
      return ["Grep", "Read", "StrReplace", "Write", "Shell", "dev_frontend_check"];
    case "conversation":
      return ["ask_question", "docs", "web_search"];
  }
}

function recommendEnabledTools(
  intent: AgentTurnIntent,
  enabledToolIds: readonly string[],
): string[] {
  const enabled = new Set(enabledToolIds);
  return preferredToolsForIntent(intent).filter((id) => enabled.has(id));
}

export function buildAgentTurnState(params: {
  actionScope: ActionScopeHint;
  chatMode: ChatMode;
  enabledToolIds: readonly string[];
  userText: string;
}): AgentTurnState {
  const intent = params.chatMode === CHAT_MODE_LAUNCHER
    ? "action_runtime"
    : params.chatMode === CHAT_MODE_ASK
      ? "conversation"
      : inferIntent(params.userText);
  return {
    intent,
    risk: params.chatMode === CHAT_MODE_ASK
      ? "read"
      : inferRisk(params.userText, params.enabledToolIds),
    targetRefs: params.actionScope.pinnedLatestAll.map((ref) => ref.id),
    recommendedToolIds: recommendEnabledTools(intent, params.enabledToolIds),
    verificationHints: verificationHintsForIntent(intent),
  };
}

export function formatAgentTurnStateForPrompt(state: AgentTurnState): string {
  const lines = [
    "## Turn state",
    `Intent: ${state.intent}`,
    `Risk: ${state.risk}`,
    state.targetRefs.length > 0
      ? `Target refs: ${state.targetRefs.join(", ")}`
      : "Target refs: none",
    state.recommendedToolIds.length > 0
      ? `Recommended tools: ${state.recommendedToolIds.join(", ")}`
      : "Recommended tools: none",
    "Verification hints:",
    ...state.verificationHints.map((hint) => `- ${hint}`),
  ];
  return lines.join("\n");
}
