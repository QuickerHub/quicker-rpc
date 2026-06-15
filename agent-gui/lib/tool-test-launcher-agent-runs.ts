import type { AgentUIMessage } from "@/lib/chat-types";
import { collectPendingAskQuestions } from "@/lib/ask-question-tool";
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

/** Hold the run open while ask_question awaits a client-side answer. */
export function launcherAgentRunAwaitingAskQuestion(
  messages: AgentUIMessage[],
): boolean {
  return collectPendingAskQuestions(messages).length > 0;
}

export function launcherAgentRunAcceptsLiveToolOutput(
  run: Pick<LauncherAgentRunEntry, "status" | "chatMessages">,
): boolean {
  return (
    run.status === "running"
    || launcherAgentRunAwaitingAskQuestion(run.chatMessages)
  );
}
