import type { AgentUIMessage } from "@/lib/chat-types";
import type { TitleTestApiResult } from "@/lib/tool-test-title";

export type TitleTestRunStatus = "running" | "done" | "error";

export type TitleTestRunEntry = {
  id: string;
  at: number;
  /** Chip / action label when started from a preset. */
  triggerLabel?: string;
  userText: string;
  assistantText: string;
  /** Exact first user message posted to /api/chat (for preview when stream not started). */
  requestPayload?: string;
  /** Production local title (reference, not used in testMode). */
  localReference: string;
  /** Chat model selection for POST /api/chat (titleTestOnly). */
  llmSelection: string;
  llmModelLabel: string;
  status: TitleTestRunStatus;
  /** Live / final /api/chat messages for embedded conversation UI. */
  chatMessages?: AgentUIMessage[];
  result?: TitleTestApiResult;
};

export function createTitleTestRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatTitleTestRunTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function truncateTitleTestSnippet(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}
