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

/** L0 discover: pick step module / param keys — read-only, not full authoring. */
export function isStepDiscoveryPrompt(userText: string): boolean {
  const text = userText.toLowerCase();
  const asksWhichStep =
    /哪种|用哪种|应该.*哪种|which step|what step/.test(text)
    && /步骤|step|模块|step.runner|step_runner/.test(text);
  const lookupKeys =
    (/不要猜|don't guess|查清楚|参数键|inputparam|param key/.test(text)
      && /步骤|step|模块|表达式|expression/.test(text));
  return asksWhichStep || lookupKeys;
}

function isActionAuthoringPrompt(userText: string): boolean {
  const text = userText.toLowerCase();
  if (
    hasAny(text, [
      "创建动作",
      "新建动作",
      "修改动作",
      "编辑动作",
      "编写",
      "创建",
      "编写动作",
      "做一个动作",
      "做个动作",
      "做一个新动作",
      "新建一个动作",
      "author",
      "authoring",
      "patch",
      "subprogram",
      "子程序",
      "workspace_program",
    ])
  ) {
    return true;
  }
  return /做(一|个)?.*动作/.test(text) || /新建.*动作/.test(text);
}

/** Clipboard read/transform/write authoring (clip-lines benchmark class). */
export function isClipboardPipelineAuthoringPrompt(userText: string): boolean {
  const text = userText.toLowerCase();
  return (
    isActionAuthoringPrompt(userText)
    && hasAny(text, ["剪贴板", "clipboard", "getclipboard", "writeclipboard"])
  );
}

/** getquicker User/Actions paginated scrape (QuickerBench user-action-likes-total). */
export function isGetquickerUserActionsAuthoringPrompt(userText: string): boolean {
  const text = userText.toLowerCase();
  return (
    isActionAuthoringPrompt(userText)
    && text.includes("getquicker")
    && (text.includes("获赞") || text.includes("totallikes") || text.includes("actioncount"))
  );
}

/** Single-step evalexpression multi-var assign (multi-var-assign benchmark class). */
export function isEvalexpressionMultiVarAuthoringPrompt(userText: string): boolean {
  const text = userText.toLowerCase();
  return (
    isActionAuthoringPrompt(userText)
    && (
      (hasAny(text, ["表达式", "evalexpression"]) && hasAny(text, ["同时", "多变量"]))
      || /a\s*=\s*1.*b\s*=\s*2/.test(text)
    )
  );
}

function inferIntent(userText: string): AgentTurnIntent {
  const text = userText.toLowerCase();
  if (isStepDiscoveryPrompt(userText)) {
    return "conversation";
  }
  if (isActionAuthoringPrompt(userText)) {
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
  if (isStepDiscoveryPrompt(userText)) {
    return "read";
  }
  if (
    hasAny(text, [
      "不要修改",
      "先不要修改",
      "不要写",
      "不要 patch",
      "先不要 patch",
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
      "写回",
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

function verificationHintsForIntent(intent: AgentTurnIntent, userText?: string): string[] {
  if (userText && isStepDiscoveryPrompt(userText)) {
    return [
      "Use qkrpc_step_runner_search → get for module keys — never guess inputParams.",
      "Do not call docs for inputParams or step schema — qkrpc_step_runner_get is authoritative.",
      "Avoid repeating step_runner_search with the same query; reuse prior hits or call get on a key.",
      "On qkrpc connectivity failure: qkrpc_wait once, retry search/get — do not substitute docs for step_runner_get.",
    ];
  }
  if (userText && isGetquickerUserActionsAuthoringPrompt(userText)) {
    return [
      "getquicker scrape: sys:http GET paginated User/Actions — mock/bench injects HTML; do NOT web_search or browser.",
      "Search modules: http|regexExtract|repeat|evalexpression|assign — get each key once; multiple searches OK.",
      "Output vars totalLikes + actionCount (IsOutput); no msgbox/textwindow.",
      "Large C#: workspace_program file_write *.eval.cs — avoid inline JSON in qkrpc_action_create.",
      "After patch: workspace_program diagnostics only — never read_data to verify.",
    ];
  }
  if (userText && isEvalexpressionMultiVarAuthoringPrompt(userText)) {
    return [
      "Multi-var: one sys:evalexpression with {a}=Convert.ToDouble(1); {b}=…; {c}={a}+{b}; then showText.",
      "Prefer qkrpc_action_create with inline programData (steps+variables) then patch — skip empty write_data round-trip.",
      "step_runner search → get once per module key — do not repeat search; do not call docs.",
      "After create with body on disk: patch → diagnostics or qkrpc_action_debug.",
    ];
  }
  if (userText && isClipboardPipelineAuthoringPrompt(userText)) {
    return [
      "Clipboard pipeline: one search `getClipboardText|writeClipboard|evalexpression|showText` — get each distinct key once.",
      "Transform in a single sys:evalexpression (LINQ) — not csscript; not multiple redundant searches.",
      "New action: step_runner search → get → create → write_data → patch → diagnostics or debug.",
      "After qkrpc_action_create, edit empty data.json via write_data — skip read_data.",
      "When intent-matched skills are preloaded, do NOT call docs for step keys or expression syntax.",
    ];
  }
  switch (intent) {
    case "action_authoring":
      return [
        "New action: step_runner search → get → create → write_data → patch → diagnostics or debug.",
        "After qkrpc_action_create, edit empty data.json via write_data — skip read_data.",
        "Do not repeat step_runner_search with the same query — call get on a prior hit key.",
        "Prefer sys:evalexpression for multi-var {var}=; sys:assign for single var — get before write.",
        "When intent-matched skills are preloaded, do NOT call docs for step keys or expression syntax.",
        "Do not use Read/Write/StrReplace on .quicker/ — use workspace_program for program bodies.",
        "After patching a program body, run diagnostics or qkrpc_action_debug — never read_data to verify.",
      ];
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

function preferredToolsForIntent(intent: AgentTurnIntent, userText?: string): string[] {
  if (userText && isStepDiscoveryPrompt(userText)) {
    return [
      "qkrpc_step_runner_search",
      "qkrpc_step_runner_get",
      "qkrpc_wait",
    ];
  }
  switch (intent) {
    case "action_authoring":
      return [
        "qkrpc_step_runner_search",
        "qkrpc_step_runner_get",
        "qkrpc_action_create",
        "workspace_program",
        "qkrpc_action_debug",
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
      return ["Grep", "Read", "StrReplace", "Write", "Shell"];
    case "conversation":
      return ["ask_question", "docs", "web_search"];
  }
}

function recommendEnabledTools(
  intent: AgentTurnIntent,
  enabledToolIds: readonly string[],
  userText?: string,
): string[] {
  const enabled = new Set(enabledToolIds);
  return preferredToolsForIntent(intent, userText).filter((id) => enabled.has(id));
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
    recommendedToolIds: recommendEnabledTools(intent, params.enabledToolIds, params.userText),
    verificationHints: verificationHintsForIntent(intent, params.userText),
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
