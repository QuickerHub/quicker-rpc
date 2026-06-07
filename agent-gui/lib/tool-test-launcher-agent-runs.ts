import type { AgentUIMessage } from "@/lib/chat-types";
import type { LauncherAgentResponseCompletionKind } from "@/lib/tool-test-launcher-agent-timing";

export type LauncherAgentRunStatus = "running" | "done" | "error";

export type LauncherAgentRunEntry = {
  id: string;
  at: number;
  scenarioId: string;
  scenarioLabel: string;
  userPrompt: string;
  llmSelection: string;
  llmModelLabel: string;
  chatMode: "launcher";
  status: LauncherAgentRunStatus;
  chatMessages: AgentUIMessage[];
  error?: string;
  /** Wall clock when first assistant output appears. */
  responseStartedAt?: number;
  /** Wall clock when execution tool triggers or stream ends (fallback). */
  responseCompletedAt?: number;
  responseCompletionKind?: LauncherAgentResponseCompletionKind;
  /** Tool that marked response complete (execution kind only). */
  executionTool?: string;
};

export function createLauncherAgentRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `launcher-agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatLauncherAgentRunTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
