/** Chat surface: full agent vs quick launcher. */
export type ChatMode = "agent" | "launcher";

export const CHAT_MODE_AGENT: ChatMode = "agent";
export const CHAT_MODE_LAUNCHER: ChatMode = "launcher";

export const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  agent: "Agent",
  launcher: "启动器",
};

export const CHAT_MODE_DESCRIPTIONS: Record<ChatMode, string> = {
  agent: "完整动作编写、编辑与发布",
  launcher: "快速运行、打开界面、改设置与常用操作",
};

/**
 * Launcher tools: operational qkrpc + settings/shell/docs + delete (UI confirm).
 * Excludes workspace disk authoring, step-runner catalog, dev/llm settings.
 */
export const LAUNCHER_TOOL_IDS = [
  "docs",
  "browser",
  "qkrpc_action_query",
  "qkrpc_action",
  "qkrpc_action_manage",
  "qkrpc_subprogram_query",
  "qkrpc_subprogram",
  "qkrpc_subprogram_manage",
  "qkrpc_fa",
  "quicker_settings",
  "launcher_resolve",
  "shell_exec",
  "qkrpc_action_delete",
  "qkrpc_subprogram_delete",
  "launcher_command_cache",
] as const;

export type LauncherToolId = (typeof LAUNCHER_TOOL_IDS)[number];

export function isChatMode(value: unknown): value is ChatMode {
  return value === CHAT_MODE_AGENT || value === CHAT_MODE_LAUNCHER;
}

export function resolveChatMode(value: unknown): ChatMode {
  return isChatMode(value) ? value : CHAT_MODE_AGENT;
}

export function defaultLauncherToolIds(): string[] {
  return [...LAUNCHER_TOOL_IDS];
}

/** Max agent steps in launcher mode (quick commands; still allow a short tool chain). */
export const LAUNCHER_MAX_STEPS = 12;

/** Max agent steps in full agent mode. */
export const AGENT_MAX_STEPS = 25;

export function maxStepsForChatMode(mode: ChatMode): number {
  return mode === CHAT_MODE_LAUNCHER ? LAUNCHER_MAX_STEPS : AGENT_MAX_STEPS;
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
  if (enabledTools?.length) {
    return enabledTools;
  }
  return fallbackEnabledTools();
}
