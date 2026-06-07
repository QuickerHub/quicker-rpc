import { getToolOrDynamicToolName, isToolOrDynamicToolUIPart } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";

/** Search / cache tools — not counted as user-intent execution. */
export const LAUNCHER_PRE_EXECUTION_TOOLS = new Set([
  "launcher_resolve",
  "launcher_command_cache",
]);

export type LauncherAgentResponseCompletionKind = "execution" | "stream-end";

export function isLauncherExecutionToolName(toolName: string): boolean {
  return !LAUNCHER_PRE_EXECUTION_TOOLS.has(toolName);
}

function isToolCallTriggered(state: string | undefined): boolean {
  return (
    state === "input-streaming"
    || state === "input-available"
    || state === "output-available"
    || state === "output-error"
  );
}

/** First assistant message with any streamed part. */
export function hasAssistantResponseStarted(
  messages: ReadonlyArray<AgentUIMessage>,
): boolean {
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    if ((msg.parts?.length ?? 0) > 0) return true;
  }
  return false;
}

/** First execution tool call (e.g. quicker_settings, qkrpc_action). */
export function findFirstExecutionToolName(
  messages: ReadonlyArray<AgentUIMessage>,
): string | null {
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts ?? []) {
      if (!isToolOrDynamicToolUIPart(part)) continue;
      const name = getToolOrDynamicToolName(part);
      if (!isLauncherExecutionToolName(name)) continue;
      if (!isToolCallTriggered(part.state)) continue;
      return name;
    }
  }
  return null;
}

export function computeLauncherAgentResponseDurationMs(params: {
  responseStartedAt?: number;
  responseCompletedAt?: number;
}): number | undefined {
  const { responseStartedAt, responseCompletedAt } = params;
  if (
    responseStartedAt == null
    || responseCompletedAt == null
    || responseCompletedAt < responseStartedAt
  ) {
    return undefined;
  }
  return responseCompletedAt - responseStartedAt;
}

export function computeLauncherAgentStartupDurationMs(params: {
  runStartedAt: number;
  responseCompletedAt?: number;
}): number | undefined {
  const { runStartedAt, responseCompletedAt } = params;
  if (responseCompletedAt == null || responseCompletedAt < runStartedAt) {
    return undefined;
  }
  return responseCompletedAt - runStartedAt;
}

export function formatLauncherAgentTimingMs(ms?: number): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2)}s`;
}
