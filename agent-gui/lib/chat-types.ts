import type { UIMessage } from "ai";
import type { AgentRecoveryDecision } from "@/lib/agent-recovery-policy";
import type { AgentTurnState } from "@/lib/agent-turn-state";
import {
  DEFAULT_MODEL_CONTEXT_TOKENS,
  resolveEnvContextLimit,
  resolveModelContextLimit,
} from "@/lib/llm-context-limits";

export type ContextSplitReason =
  | "none"
  | "token_budget"
  | "usage_fallback"
  | "message_cap";

/** Token usage attached to assistant messages via messageMetadata. */
export type ContextCompressionMetadata = {
  summary: string;
  throughMessageId: string;
  sourceInputTokens: number;
  createdAt: number;
  recentMessagesKept: number;
  totalMessagesAtCreation: number;
  recentTokensEstimate?: number;
  splitReason?: ContextSplitReason;
  microcompactApplied?: boolean;
  summaryReused?: boolean;
  /** Provider rejected prompt length; server retried with forced compaction. */
  reactiveCompactAttempted?: boolean;
  /** Workspace file paths reinjected into system after compression. */
  reinjectPaths?: string[];
};

/** Token usage attached to assistant messages via messageMetadata. */
export type ChatUsageMetadata = {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  contextCompression?: ContextCompressionMetadata;
  launcherCacheDirect?: boolean;
  launcherResolveDirect?: boolean;
  resolveQuery?: string;
  agentTurnState?: AgentTurnState;
  recoveryDecision?: AgentRecoveryDecision;
  recentToolFeedbackCount?: number;
};

export type AgentUIMessage = UIMessage<ChatUsageMetadata>;

/** @deprecated Use resolveModelContextLimit or API-provided contextLimit */
export const DEFAULT_CONTEXT_LIMIT = DEFAULT_MODEL_CONTEXT_TOKENS;

/** Client-side fallback when model id is unknown (env override only). */
export function resolveContextLimit(modelId?: string): number {
  if (modelId?.trim()) {
    return resolveModelContextLimit(modelId).tokens;
  }
  return resolveEnvContextLimit() ?? DEFAULT_MODEL_CONTEXT_TOKENS;
}

export type SessionUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  assistantTurns: number;
};

export function aggregateSessionUsage(
  messages: AgentUIMessage[],
): SessionUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let reasoningTokens = 0;
  let assistantTurns = 0;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const meta = message.metadata;
    if (!meta) continue;

    const hasUsage =
      meta.inputTokens !== undefined
      || meta.outputTokens !== undefined
      || meta.totalTokens !== undefined;
    if (!hasUsage) continue;

    assistantTurns += 1;
    inputTokens += meta.inputTokens ?? 0;
    outputTokens += meta.outputTokens ?? 0;
    reasoningTokens += meta.reasoningTokens ?? 0;
    totalTokens += meta.totalTokens ?? 0;
  }

  if (totalTokens === 0 && inputTokens + outputTokens > 0) {
    totalTokens = inputTokens + outputTokens;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    assistantTurns,
  };
}

export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 100) / 10}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
