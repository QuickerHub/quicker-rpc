import { isTextUIPart } from "ai";
import type {
  AgentUIMessage,
  ContextCompressionMetadata,
  ContextSplitReason,
} from "@/lib/chat-types";
import { alignSplitIndexToRoundStart } from "@/lib/context-api-rounds";
import {
  estimateMessageTokens,
  estimateThreadTokens,
} from "@/lib/context-token-estimate";

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
export const COMPACTION_HEADROOM_TOKENS = 4_096;

/** Measured provider inputTokens (Cursor ~90%). */
export const USAGE_TRIGGER_RATIO = 0.9;

/** Char/4 estimate when usage metadata is missing. */
export const ESTIMATE_TRIGGER_RATIO = 0.92;

/** Legacy default; used as usage-fallback slice size when estimate lags API usage. */
export const DEFAULT_RECENT_MESSAGE_COUNT = 12;

/** Share of context window for the full-fidelity recent slice. */
export const RECENT_BUDGET_RATIO = 0.45;

export const MIN_RECENT_MESSAGES = 4;

export const MAX_RECENT_MESSAGES = 24;

export type { ContextSplitReason } from "@/lib/chat-types";

export type ContextSplitResult = {
  splitIndex: number;
  recentTokenEstimate: number;
  splitReason: ContextSplitReason;
};

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

export function getLatestContextCompression(
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
  return estimateThreadTokens(messages);
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

export function resolveRecentTokenBudget(contextLimit: number): number {
  if (contextLimit <= 0) return 0;
  const byRatio = Math.floor(contextLimit * RECENT_BUDGET_RATIO);
  return Math.max(1, byRatio - COMPACTION_HEADROOM_TOKENS);
}

/** Whether context compression should run for the next model request. */
export function shouldCompressContextMessages(
  messages: AgentUIMessage[],
  contextLimit: number,
  options?: { preferTokenEstimate?: boolean },
): boolean {
  if (contextLimit <= 0) return false;
  const estimated = approximateTokensFromMessages(messages);
  const estimateThreshold = resolveCompactionEstimateThreshold(contextLimit);
  if (options?.preferTokenEstimate) {
    return estimated >= estimateThreshold;
  }
  const latestUsage = latestAssistantUsage(messages);
  if (latestUsage) {
    return latestUsage.inputTokens >= resolveCompactionUsageThreshold(contextLimit);
  }
  return estimated >= estimateThreshold;
}

function countRecentMessagesFromTail(
  messages: AgentUIMessage[],
  recentBudget: number,
): { recentCount: number; recentTokenEstimate: number } {
  let recentCount = 0;
  let recentTokenEstimate = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const messageTokens = estimateMessageTokens(messages[i]!);
    const nextCount = recentCount + 1;
    const nextTokens = recentTokenEstimate + messageTokens;
    if (nextCount > MAX_RECENT_MESSAGES) break;
    if (nextTokens > recentBudget && recentCount >= 1) break;
    if (
      recentCount >= MIN_RECENT_MESSAGES
      && nextTokens > recentBudget
    ) {
      break;
    }
    recentCount = nextCount;
    recentTokenEstimate = nextTokens;
  }
  return { recentCount, recentTokenEstimate };
}

/** Index where older messages end and the recent window begins. */
export function resolveContextSplitIndex(
  messages: AgentUIMessage[],
  contextLimit: number,
  options?: { usageIndicatesPressure?: boolean },
): ContextSplitResult {
  if (messages.length === 0) {
    return { splitIndex: 0, recentTokenEstimate: 0, splitReason: "none" };
  }

  const recentBudget = resolveRecentTokenBudget(contextLimit);
  const totalTokens = estimateThreadTokens(messages);
  if (totalTokens <= recentBudget) {
    const usageIndicatesPressure =
      options?.usageIndicatesPressure
      ?? shouldCompressContextMessages(messages, contextLimit);
    if (
      usageIndicatesPressure
      && messages.length > MIN_RECENT_MESSAGES
    ) {
      const fallbackSplit = alignSplitIndexToRoundStart(
        messages,
        Math.max(1, messages.length - DEFAULT_RECENT_MESSAGE_COUNT),
      );
      if (fallbackSplit > 0) {
        return {
          splitIndex: fallbackSplit,
          recentTokenEstimate: estimateThreadTokens(messages.slice(fallbackSplit)),
          splitReason: "usage_fallback",
        };
      }
    }
    return {
      splitIndex: 0,
      recentTokenEstimate: totalTokens,
      splitReason: "none",
    };
  }

  const { recentCount, recentTokenEstimate } = countRecentMessagesFromTail(
    messages,
    recentBudget,
  );
  let splitIndex = Math.max(0, messages.length - recentCount);
  splitIndex = alignSplitIndexToRoundStart(messages, splitIndex);

  if (splitIndex <= 0 && messages.length > MIN_RECENT_MESSAGES) {
    splitIndex = alignSplitIndexToRoundStart(
      messages,
      Math.max(1, messages.length - MIN_RECENT_MESSAGES),
    );
  }

  if (splitIndex <= 0) {
    return { splitIndex: 0, recentTokenEstimate: totalTokens, splitReason: "none" };
  }

  return {
    splitIndex,
    recentTokenEstimate: estimateThreadTokens(messages.slice(splitIndex)),
    splitReason: recentCount >= MAX_RECENT_MESSAGES ? "message_cap" : "token_budget",
  };
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
  const lastCompression = getLatestContextCompression(messages);
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
  splitReason: ContextSplitReason;
  recentTokenEstimate: number;
  recentTokenBudget: number;
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
  const shouldCompress = shouldCompressContextMessages(messages, contextLimit);
  const split = resolveContextSplitIndex(messages, contextLimit, {
    usageIndicatesPressure: shouldCompress,
  });
  const force = options?.force === true;
  const latestInputTokens = latestAssistantUsage(messages)?.inputTokens ?? null;
  const estimatedTokens = approximateTokensFromMessages(messages);
  const usageThreshold = resolveCompactionUsageThreshold(contextLimit);
  const estimateThreshold = resolveCompactionEstimateThreshold(contextLimit);
  return {
    shouldCompress,
    force,
    splitIndex: split.splitIndex,
    splitReason: split.splitReason,
    recentTokenEstimate: split.recentTokenEstimate,
    recentTokenBudget: resolveRecentTokenBudget(contextLimit),
    olderCount: split.splitIndex,
    recentCount: Math.max(0, messages.length - split.splitIndex),
    reusableSummary: selectReusableContextSummary(messages, split.splitIndex),
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
