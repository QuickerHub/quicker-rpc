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
} from "@/lib/chat-types";
import {
  DEFAULT_RECENT_MESSAGE_COUNT,
  resolveContextSplitIndex,
  selectReusableContextSummary,
  shouldCompressContextMessages,
} from "@/lib/context-compression-shared";
import { recordManagedLlmUsageAsync } from "@/lib/llm-usage-tracker.server";
import type { LlmSelection } from "@/lib/llm-selection";

export {
  DEFAULT_RECENT_MESSAGE_COUNT,
  previewContextCompression,
  resolveCompactionEstimateThreshold,
  resolveCompactionUsageThreshold,
  resolveContextSplitIndex,
  selectReusableContextSummary,
  shouldCompressContextMessages,
  type ContextCompressionPreview,
} from "@/lib/context-compression-shared";

const MAX_SUMMARY_SOURCE_CHARS = 18_000;
const MAX_SUMMARY_OUTPUT_TOKENS = 700;

const CONTEXT_COMPRESSION_SYSTEM_PROMPT =
  "You compress long chat history for future turns."
  + " Summarize in concise bullet points while preserving user goals,"
  + " key decisions, tool outcomes, file or action identifiers, failed attempts,"
  + " and unresolved tasks."
  + " Avoid filler and avoid repeating details from recent messages."
  + " Output plain text only.";

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

  if (
    part.type === "tool-qkrpc_action"
    || part.type === "tool-qkrpc_action_query"
    || part.type === "tool-qkrpc_action_get"
    || part.type === "tool-qkrpc_action_list"
    || part.type === "tool-qkrpc_action_patch"
    || part.type === "tool-qkrpc_action_create"
    || part.type === "tool-workspace_program"
  ) {
    const state = "state" in part ? String(part.state ?? "unknown") : "unknown";
    return `[tool:${part.type}] state=${state}`;
  }

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
): ContextCompressionMetadata {
  return {
    summary,
    throughMessageId,
    sourceInputTokens,
    createdAt: Date.now(),
    recentMessagesKept: DEFAULT_RECENT_MESSAGE_COUNT,
    totalMessagesAtCreation,
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
  /** Test hook: override LLM summarization of older messages. */
  summarizeOlderMessages?: (
    model: LanguageModel,
    olderMessages: AgentUIMessage[],
  ) => Promise<string | null>;
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
    force = false,
  } = options;
  const summarize =
    summarizeOlderMessages
    ?? ((
      languageModel,
      olderMessages,
    ) => createSummary(languageModel, olderMessages, usageTracking));
  const baseModelMessages = await convertToModelMessages(messages);
  const splitIndex = resolveContextSplitIndex(messages);
  const trigger =
    splitIndex > 0
    && (force || shouldCompressContextMessages(messages, contextLimit));
  if (!trigger) {
    return { modelMessages: baseModelMessages, compressed: false };
  }

  const olderMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);
  if (olderMessages.length === 0 || recentMessages.length === 0) {
    return { modelMessages: baseModelMessages, compressed: false };
  }

  const throughMessageId = olderMessages[olderMessages.length - 1]!.id;
  const reuseSummary = selectReusableContextSummary(messages, splitIndex);
  const summary = reuseSummary ?? (await summarize(model, olderMessages));
  if (!summary) {
    return { modelMessages: baseModelMessages, compressed: false };
  }

  const recentModelMessages = await convertToModelMessages(recentMessages);
  const sourceInputTokens = latestAssistantUsage(messages)?.inputTokens ?? 0;
  const metadata = buildCompressionMetadata(
    summary,
    throughMessageId,
    sourceInputTokens,
    messages.length,
  );
  return {
    modelMessages: recentModelMessages,
    systemSuffix: renderCompressionSystemSuffix(summary),
    contextCompression: metadata,
    compressed: true,
  };
}
