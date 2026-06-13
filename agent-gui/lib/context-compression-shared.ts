import { isTextUIPart } from "ai";
import type {
  AgentUIMessage,
  ContextCompressionMetadata,
} from "@/lib/chat-types";

/**
 * Context compaction thresholds (aligned with mainstream coding agents).
 *
 * - Cursor: auto-summarize at ~90% of the context window (official forum).
 * - Claude Code: compact near the model limit with a fixed headroom buffer.
 *
 * We compress only when approaching the hard limit — not at 70% — so short
 * multi-turn sessions keep full tool history.
 */

/** Tokens reserved for system, next turn, and the compaction summary call. */
const COMPACTION_HEADROOM_TOKENS = 4_096;

/** Measured provider inputTokens (Cursor ~90%). */
const USAGE_TRIGGER_RATIO = 0.9;

/** Char/4 estimate when usage metadata is missing. */
const ESTIMATE_TRIGGER_RATIO = 0.92;

export const DEFAULT_RECENT_MESSAGE_COUNT = 12;

function latestAssistantUsage(
  messages: AgentUIMessage[],
): { inputTokens: number } | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const inputTokens = message.metadata?.inputTokens;
    if (typeof inputTokens === "number" && inputTokens > 0) {
      return { inputTokens };
    }
  }
  return null;
}

function latestContextCompression(
  messages: AgentUIMessage[],
): ContextCompressionMetadata | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const compression = message.metadata?.contextCompression;
    if (compression?.summary?.trim()) {
      return compression;
    }
  }
  return null;
}

function approximateTokensFromMessages(messages: AgentUIMessage[]): number {
  let chars = 0;
  for (const message of messages) {
    chars += message.role.length + 8;
    for (const part of message.parts) {
      if (isTextUIPart(part)) {
        chars += part.text.length;
      } else {
        chars += JSON.stringify(part).length;
      }
    }
  }
  return Math.ceil(chars / 4);
}

/** Token count at which measured usage should trigger compaction. */
export function resolveCompactionUsageThreshold(contextLimit: number): number {
  if (contextLimit <= 0) return Number.POSITIVE_INFINITY;
  const byRatio = Math.floor(contextLimit * USAGE_TRIGGER_RATIO);
  const byHeadroom = contextLimit - COMPACTION_HEADROOM_TOKENS;
  return Math.max(1, Math.min(byRatio, byHeadroom));
}

/** Token count at which char-estimate should trigger compaction. */
export function resolveCompactionEstimateThreshold(contextLimit: number): number {
  if (contextLimit <= 0) return Number.POSITIVE_INFINITY;
  const byRatio = Math.floor(contextLimit * ESTIMATE_TRIGGER_RATIO);
  const byHeadroom = contextLimit - COMPACTION_HEADROOM_TOKENS;
  return Math.max(1, Math.min(byRatio, byHeadroom));
}

/** Whether context compression should run for the next model request. */
export function shouldCompressContextMessages(
  messages: AgentUIMessage[],
  contextLimit: number,
): boolean {
  if (contextLimit <= 0) return false;
  const latestUsage = latestAssistantUsage(messages);
  if (latestUsage) {
    return latestUsage.inputTokens >= resolveCompactionUsageThreshold(contextLimit);
  }
  const estimated = approximateTokensFromMessages(messages);
  return estimated >= resolveCompactionEstimateThreshold(contextLimit);
}

/** Index where older messages end and the recent window begins. */
export function resolveContextSplitIndex(messages: AgentUIMessage[]): number {
  if (messages.length <= DEFAULT_RECENT_MESSAGE_COUNT) return 0;
  return Math.max(0, messages.length - DEFAULT_RECENT_MESSAGE_COUNT);
}

function findMessageIndexById(
  messages: AgentUIMessage[],
  id: string,
): number {
  return messages.findIndex((item) => item.id === id);
}

/** Reuse a prior summary when it still covers the older slice being compressed. */
export function selectReusableContextSummary(
  messages: AgentUIMessage[],
  splitIndex: number,
): string | null {
  const lastCompression = latestContextCompression(messages);
  if (!lastCompression) return null;
  const throughIndex = findMessageIndexById(
    messages,
    lastCompression.throughMessageId,
  );
  if (throughIndex < 0 || throughIndex < splitIndex - 1) return null;
  return lastCompression.summary;
}

export type ContextCompressionPreview = {
  shouldCompress: boolean;
  force: boolean;
  splitIndex: number;
  olderCount: number;
  recentCount: number;
  reusableSummary: string | null;
  estimatedTokens: number;
  latestInputTokens: number | null;
  usageRatio: number | null;
  estimateRatio: number;
  contextLimit: number;
  usageThreshold: number;
  estimateThreshold: number;
};

/** Dry-run diagnostics before calling prepareCompressedContext. */
export function previewContextCompression(
  messages: AgentUIMessage[],
  contextLimit: number,
  options?: { force?: boolean },
): ContextCompressionPreview {
  const splitIndex = resolveContextSplitIndex(messages);
  const shouldCompress = shouldCompressContextMessages(messages, contextLimit);
  const force = options?.force === true;
  const latestInputTokens = latestAssistantUsage(messages)?.inputTokens ?? null;
  const estimatedTokens = approximateTokensFromMessages(messages);
  const usageThreshold = resolveCompactionUsageThreshold(contextLimit);
  const estimateThreshold = resolveCompactionEstimateThreshold(contextLimit);
  return {
    shouldCompress,
    force,
    splitIndex,
    olderCount: splitIndex,
    recentCount: Math.max(0, messages.length - splitIndex),
    reusableSummary: selectReusableContextSummary(messages, splitIndex),
    estimatedTokens,
    latestInputTokens,
    usageRatio:
      latestInputTokens != null && contextLimit > 0
        ? latestInputTokens / contextLimit
        : null,
    estimateRatio: contextLimit > 0 ? estimatedTokens / contextLimit : 0,
    contextLimit,
    usageThreshold,
    estimateThreshold,
  };
}
