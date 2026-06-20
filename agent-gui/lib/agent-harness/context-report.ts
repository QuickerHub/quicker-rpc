import type { ContextCompressionMetadata } from "@/lib/chat-types";
import { estimateModelMessagesTokens } from "@/lib/context-step-microcompact";
import type { ModelMessage } from "ai";
import type { TurnContextReport, TurnContextReportCategory } from "./types";

/** Rough token estimate (chars / 4) — matches Context Usage panel. */
export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateToolsTokens(
  tools: Record<string, { description?: string; inputSchema?: unknown }>,
): number {
  let chars = 0;
  for (const [id, tool] of Object.entries(tools)) {
    chars += id.length;
    chars += tool.description?.length ?? 0;
    try {
      chars += JSON.stringify(tool.inputSchema ?? {}).length;
    } catch {
      chars += 0;
    }
  }
  return Math.ceil(chars / 4);
}

export function buildTurnContextReport(params: {
  system: string;
  tools: Record<string, { description?: string; inputSchema?: unknown }>;
  modelMessages: ModelMessage[];
  contextLimit: number;
  contextCompression?: ContextCompressionMetadata;
  slidingWindowApplied?: boolean;
}): TurnContextReport {
  const systemTokens = estimateTextTokens(params.system);
  const toolTokens = estimateToolsTokens(params.tools);
  const conversationTokens = estimateModelMessagesTokens(params.modelMessages);
  const summarizedTokens = params.contextCompression?.summary
    ? estimateTextTokens(params.contextCompression.summary)
    : 0;

  const categories: TurnContextReportCategory[] = [
    { id: "system", label: "System prompt", tokens: systemTokens },
    { id: "tools", label: "Tool definitions", tokens: toolTokens },
    { id: "conversation", label: "Conversation", tokens: conversationTokens },
  ];

  if (summarizedTokens > 0) {
    categories.push({
      id: "summarized",
      label: "Summarized history",
      tokens: summarizedTokens,
    });
  }

  const estimatedInputTokens =
    systemTokens + toolTokens + conversationTokens + summarizedTokens;

  return {
    contextWindowTokens: params.contextLimit,
    estimatedInputTokens,
    categories,
    compression: params.contextCompression,
    slidingWindowApplied: params.slidingWindowApplied,
  };
}

/** Align category totals with provider prompt usage when estimates lag (e.g. multi-step tool turns). */
export function reconcileTurnContextReportWithApiUsage(
  report: TurnContextReport,
  apiInputTokens: number | undefined,
): TurnContextReport {
  if (!apiInputTokens || apiInputTokens <= 0) return report;

  const categorySum = report.categories.reduce((sum, category) => sum + category.tokens, 0);
  if (apiInputTokens <= categorySum) {
    return {
      ...report,
      estimatedInputTokens: Math.max(report.estimatedInputTokens, apiInputTokens),
    };
  }

  const residual = apiInputTokens - categorySum;
  const categories = report.categories.map((category) =>
    category.id === "conversation"
      ? { ...category, tokens: category.tokens + residual }
      : category,
  );

  return {
    ...report,
    categories,
    estimatedInputTokens: apiInputTokens,
  };
}
