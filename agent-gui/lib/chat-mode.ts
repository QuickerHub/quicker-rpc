/** Chat surface: full agent vs read-only ask vs quick launcher. */
export type ChatMode = "agent" | "ask" | "launcher";

export const CHAT_MODE_AGENT: ChatMode = "agent";
export const CHAT_MODE_ASK: ChatMode = "ask";
export const CHAT_MODE_LAUNCHER: ChatMode = "launcher";

export const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  agent: "Agent",
  ask: "Ask",
  launcher: "启动器",
};

export const CHAT_MODE_DESCRIPTIONS: Record<ChatMode, string> = {
  agent: "完整动作编写、编辑与发布",
  ask: "只读问答与探索，不修改或运行",
  launcher: "快速运行、打开界面、改设置与常用操作",
};

/**
 * Launcher tools: operational qkrpc + settings/shell/docs + delete (UI confirm).
 * Excludes workspace disk authoring, step-runner catalog, dev/llm settings.
 */
export const LAUNCHER_TOOL_IDS = [
  "docs",
  "ask_question",
  "web_search",
  "browser",
  "qkrpc_action_query",
  "qkrpc_action_get",
  "qkrpc_action_run",
  "qkrpc_action_debug",
  "qkrpc_action_float",
  "qkrpc_action_edit",
  "qkrpc_action_set_metadata",
  "qkrpc_action_move",
  "qkrpc_action_publish",
  "qkrpc_profile_create",
  "qkrpc_profile_delete",
  "qkrpc_profile_reorder",
  "qkrpc_process_ensure",
  "qkrpc_subprogram_query",
  "qkrpc_subprogram_get",
  "qkrpc_subprogram_edit",
  "qkrpc_subprogram_create",
  "qkrpc_fa",
  "quicker_settings",
  "launcher_resolve",
  "Read",
  "Write",
  "StrReplace",
  "Shell",
  "qkrpc_action_delete",
  "qkrpc_subprogram_delete",
  "launcher_command_cache",
] as const;

export type LauncherToolId = (typeof LAUNCHER_TOOL_IDS)[number];

/**
 * Ask tools: read-only exploration (Cursor-style Ask mode).
 * Excludes writes, shell, runs, patches, deletes, and subagents.
 */
export const ASK_TOOL_IDS = [
  "docs",
  "ask_question",
  "web_search",
  "browser",
  "dev_frontend_check",
  "qkrpc_wait",
  "Read",
  "Grep",
  "workspace_program",
  "qkrpc_action_query",
  "qkrpc_action_get",
  "qkrpc_subprogram_query",
  "qkrpc_subprogram_get",
  "qkrpc_step_runner_search",
  "qkrpc_step_runner_get",
  "qkrpc_fa",
  "launcher_resolve",
  "quicker_settings",
] as const;

export type AskToolId = (typeof ASK_TOOL_IDS)[number];

export function defaultAskToolIds(): string[] {
  return [...ASK_TOOL_IDS];
}

export function isChatMode(value: unknown): value is ChatMode {
  return (
    value === CHAT_MODE_AGENT
    || value === CHAT_MODE_ASK
    || value === CHAT_MODE_LAUNCHER
  );
}

export function resolveChatMode(value: unknown): ChatMode {
  return isChatMode(value) ? value : CHAT_MODE_AGENT;
}

export function defaultLauncherToolIds(): string[] {
  return [...LAUNCHER_TOOL_IDS];
}

/** Max agent steps in launcher mode (quick commands; still allow a short tool chain). */
export const LAUNCHER_MAX_STEPS = 12;

/** Max agent steps in ask mode (read-only exploration). */
export const ASK_MAX_STEPS = 15;

/** Max agent steps in full agent mode. */
export const AGENT_MAX_STEPS = 25;

export function maxStepsForChatMode(mode: ChatMode): number {
  if (mode === CHAT_MODE_LAUNCHER) return LAUNCHER_MAX_STEPS;
  if (mode === CHAT_MODE_ASK) return ASK_MAX_STEPS;
  return AGENT_MAX_STEPS;
}

/** Resolve tool ids sent to /api/chat for the active chat mode. */
export function resolveEnabledToolsForChatMode(
  mode: ChatMode,
  enabledTools: string[] | undefined,
  fallbackEnabledTools: () => string[],
): string[] {
  if (mode === CHAT_MODE_LAUNCHER) {
    return defaultLauncherToolIds();
  }
  if (mode === CHAT_MODE_ASK) {
    return defaultAskToolIds();
  }
  if (enabledTools?.length) {
    return enabledTools;
  }
  return fallbackEnabledTools();
}
