import {
  convertToModelMessages,
  generateText,
  isTextUIPart,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import type {
  AgentUIMessage,
  ContextCompressionMetadata,
  ContextSplitReason,
} from "@/lib/chat-types";
import {
  resolveContextSplitIndex,
  selectReusableContextSummary,
  shouldCompressContextMessages,
  type ContextSplitResult,
} from "@/lib/context-compression-shared";
import { microcompactToolOutputs } from "@/lib/context-microcompact";
import { recordManagedLlmUsageAsync } from "@/lib/llm-usage-tracker.server";
import type { PostCompactReinjectResult } from "@/lib/context-compaction-reinject";
import type { LlmSelection } from "@/lib/llm-selection";

export {
  DEFAULT_RECENT_MESSAGE_COUNT,
  MAX_RECENT_MESSAGES,
  MIN_RECENT_MESSAGES,
  previewContextCompression,
  RECENT_BUDGET_RATIO,
  resolveCompactionEstimateThreshold,
  resolveCompactionUsageThreshold,
  resolveContextSplitIndex,
  resolveRecentTokenBudget,
  selectReusableContextSummary,
  shouldCompressContextMessages,
  type ContextCompressionPreview,
  type ContextSplitReason,
  type ContextSplitResult,
} from "@/lib/context-compression-shared";

const MAX_SUMMARY_SOURCE_CHARS = 24_000;
const MAX_SUMMARY_OUTPUT_TOKENS = 1800;

const CONTEXT_COMPRESSION_SYSTEM_PROMPT =
  "You compress long chat history for future turns."
  + " Output plain text with these sections (use the headings exactly):"
  + "\n## User goals"
  + "\n## Key identifiers"
  + "\n## Decisions and tool outcomes"
  + "\n## Failures and fixes"
  + "\n## Unresolved tasks"
  + "\nPreserve action UUIDs, file paths, settings keys, and error messages."
  + " Avoid filler and do not repeat details that remain in recent messages.";

type CompressionPreparation = {
  modelMessages: ModelMessage[];
  contextCompression?: ContextCompressionMetadata;
  systemSuffix?: string;
  compressed: boolean;
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

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function summarizeToolOutput(part: AgentUIMessage["parts"][number]): string | null {
  if (!part.type.startsWith("tool-") || !("state" in part)) return null;
  const state = String(part.state ?? "unknown");
  if (state !== "output-available") {
    return `[tool:${part.type}] state=${state}`;
  }
  const output = readRecord("output" in part ? part.output : null);
  if (!output) {
    return `[tool:${part.type}] state=${state}`;
  }
  if (output.compact === true) {
    const actionId = output.actionId ?? readRecord(output.data)?.actionId;
    return `[tool:${part.type}] compact ok=${String(output.ok ?? "?")}`
      + (actionId != null ? ` actionId=${String(actionId)}` : "");
  }
  if (part.type === "tool-qkrpc_action_create") {
    const data = readRecord(output.data);
    return `[tool:create] ok=${String(output.ok)} actionId=${String(data?.actionId ?? "?")}`;
  }
  if (part.type === "tool-workspace_program") {
    return `[tool:workspace_program] ok=${String(output.ok)} path=${String(output.path ?? "?")}`;
  }
  if (part.type === "tool-shell_exec") {
    const stderr = typeof output.stderr === "string" ? output.stderr.slice(0, 120) : "";
    return `[tool:shell_exec] ok=${String(output.ok)} exit=${String(output.exitCode ?? "?")}`
      + (stderr ? ` stderr=${stderr}` : "");
  }
  const err = output.errorMessage ?? output.message;
  return `[tool:${part.type}] ok=${String(output.ok ?? "?")}`
    + (err != null ? ` error=${String(err).slice(0, 120)}` : "");
}

function summarizePart(
  part: AgentUIMessage["parts"][number],
): string | null {
  if (isTextUIPart(part)) {
    const text = part.text.trim();
    if (!text) return null;
    return text;
  }

  if (part.type === "reasoning") {
    return null;
  }

  const toolSummary = summarizeToolOutput(part);
  if (toolSummary) return toolSummary;

  const raw = JSON.stringify(part);
  if (!raw.trim()) return null;
  return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
}

function buildSummarySource(messages: AgentUIMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const chunks = message.parts
      .map((part) => summarizePart(part))
      .filter((item): item is string => Boolean(item && item.trim()));
    if (chunks.length === 0) continue;
    const role = message.role === "user" ? "user" : "assistant";
    lines.push(`${role}: ${chunks.join("\n")}`);
    const joined = lines.join("\n\n");
    if (joined.length >= MAX_SUMMARY_SOURCE_CHARS) {
      return `${joined.slice(0, MAX_SUMMARY_SOURCE_CHARS)}...`;
    }
  }
  return lines.join("\n\n");
}

function renderCompressionSystemSuffix(summary: string): string {
  return (
    "Historical context summary (auto-compressed):\n"
    + `${summary.trim()}\n`
    + "Use this summary as authoritative history for older turns."
  );
}

async function createSummary(
  model: LanguageModel,
  messagesToCompress: AgentUIMessage[],
  usageTracking?: {
    selection: LlmSelection;
    modelId: string;
  },
): Promise<string | null> {
  const source = buildSummarySource(messagesToCompress).trim();
  if (!source) return null;
  const result = await generateText({
    model,
    system: CONTEXT_COMPRESSION_SYSTEM_PROMPT,
    prompt: source,
    maxOutputTokens: MAX_SUMMARY_OUTPUT_TOKENS,
    temperature: 0.1,
  });
  if (usageTracking) {
    recordManagedLlmUsageAsync({
      selection: usageTracking.selection,
      modelId: usageTracking.modelId,
      source: "compression",
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
      totalTokens: result.usage?.totalTokens,
      reasoningTokens: result.usage?.reasoningTokens,
    });
  }
  const summary = result.text.trim();
  return summary || null;
}

function buildCompressionMetadata(
  summary: string,
  throughMessageId: string,
  sourceInputTokens: number,
  totalMessagesAtCreation: number,
  split: ContextSplitResult,
  options: {
    summaryReused: boolean;
    microcompactApplied: boolean;
    reactiveCompactAttempted?: boolean;
    reinjectPaths?: string[];
  },
): ContextCompressionMetadata {
  return {
    summary,
    throughMessageId,
    sourceInputTokens,
    createdAt: Date.now(),
    recentMessagesKept: totalMessagesAtCreation - split.splitIndex,
    totalMessagesAtCreation,
    recentTokensEstimate: split.recentTokenEstimate,
    splitReason: split.splitReason,
    microcompactApplied: options.microcompactApplied,
    summaryReused: options.summaryReused,
    reactiveCompactAttempted: options.reactiveCompactAttempted,
    reinjectPaths: options.reinjectPaths,
  };
}

export type PrepareCompressedContextOptions = {
  messages: AgentUIMessage[];
  model: LanguageModel;
  contextLimit: number;
  usageTracking?: {
    selection: LlmSelection;
    modelId: string;
  };
  /** Test/dev: compress when splitIndex > 0 even below usage thresholds. */
  force?: boolean;
  /** Set when retrying after provider context-length rejection. */
  reactiveCompactAttempted?: boolean;
  /** Test hook: override LLM summarization of older messages. */
  summarizeOlderMessages?: (
    model: LanguageModel,
    olderMessages: AgentUIMessage[],
  ) => Promise<string | null>;
  /** Server hook: reinject recent patch file snippets after compression. */
  reinjectRecentPatches?: (
    recentMessages: AgentUIMessage[],
  ) => Promise<PostCompactReinjectResult>;
};

export async function prepareCompressedContext(
  options: PrepareCompressedContextOptions,
): Promise<CompressionPreparation> {
  const {
    messages,
    model,
    contextLimit,
    usageTracking,
    summarizeOlderMessages,
    reinjectRecentPatches,
    force = false,
    reactiveCompactAttempted = false,
  } = options;
  const summarize =
    summarizeOlderMessages
    ?? ((
      languageModel,
      olderMessages,
    ) => createSummary(languageModel, olderMessages, usageTracking));

  const usagePressure = force || shouldCompressContextMessages(messages, contextLimit);
  const split = resolveContextSplitIndex(messages, contextLimit, {
    usageIndicatesPressure: usagePressure,
  });
  const micro = microcompactToolOutputs(messages, { splitIndex: split.splitIndex });
  const workingMessages = micro.applied ? micro.messages : messages;
  const workingSplit = micro.applied
    ? resolveContextSplitIndex(workingMessages, contextLimit, {
        usageIndicatesPressure: usagePressure,
      })
    : split;

  const baseModelMessages = await convertToModelMessages(workingMessages);
  const trigger = workingSplit.splitIndex > 0 && usagePressure;
  if (!trigger) {
    return { modelMessages: baseModelMessages, compressed: false };
  }

  const olderMessages = workingMessages.slice(0, workingSplit.splitIndex);
  const recentMessages = workingMessages.slice(workingSplit.splitIndex);
  if (olderMessages.length === 0 || recentMessages.length === 0) {
    return { modelMessages: baseModelMessages, compressed: false };
  }

  const throughMessageId = olderMessages[olderMessages.length - 1]!.id;
  const reuseSummary = selectReusableContextSummary(
    workingMessages,
    workingSplit.splitIndex,
  );
  const summary = reuseSummary ?? (await summarize(model, olderMessages));
  if (!summary) {
    return { modelMessages: baseModelMessages, compressed: false };
  }

  const recentModelMessages = await convertToModelMessages(recentMessages);
  const sourceInputTokens = latestAssistantUsage(messages)?.inputTokens ?? 0;
  const reinject = reinjectRecentPatches
    ? await reinjectRecentPatches(recentMessages)
    : { block: null, paths: [] };
  const metadata = buildCompressionMetadata(
    summary,
    throughMessageId,
    sourceInputTokens,
    workingMessages.length,
    workingSplit,
    {
      summaryReused: Boolean(reuseSummary),
      microcompactApplied: micro.applied,
      reactiveCompactAttempted: reactiveCompactAttempted || undefined,
      reinjectPaths: reinject.paths.length > 0 ? reinject.paths : undefined,
    },
  );
  const systemSuffixParts = [
    renderCompressionSystemSuffix(summary),
    reinject.block,
  ].filter((block): block is string => Boolean(block?.trim()));
  return {
    modelMessages: recentModelMessages,
    systemSuffix: systemSuffixParts.join("\n\n"),
    contextCompression: metadata,
    compressed: true,
  };
}
