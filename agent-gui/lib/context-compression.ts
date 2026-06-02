import {
  convertToModelMessages,
  generateText,
  isTextUIPart,
  pruneMessages,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import type {
  AgentUIMessage,
  ContextCompressionMetadata,
} from "@/lib/chat-types";

const COMPRESSION_TRIGGER_RATIO = 0.7;
const ESTIMATE_TRIGGER_RATIO = 0.85;
const DEFAULT_RECENT_MESSAGE_COUNT = 12;
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

/** Whether context compression should run for the next model request. */
export function shouldCompressContextMessages(
  messages: AgentUIMessage[],
  contextLimit: number,
): boolean {
  if (contextLimit <= 0) return false;
  const latestUsage = latestAssistantUsage(messages);
  if (
    latestUsage
    && latestUsage.inputTokens / contextLimit >= COMPRESSION_TRIGGER_RATIO
  ) {
    return true;
  }
  const estimated = approximateTokensFromMessages(messages);
  return estimated / contextLimit >= ESTIMATE_TRIGGER_RATIO;
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
    part.type === "tool-qkrpc_action_get"
    || part.type === "tool-qkrpc_action_list"
    || part.type === "tool-qkrpc_action_patch"
    || part.type === "tool-qkrpc_action_create"
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
  const summary = result.text.trim();
  return summary || null;
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

function safePruneMessages(messages: ModelMessage[]): ModelMessage[] {
  return pruneMessages({
    messages,
    reasoning: "before-last-message",
    toolCalls: "before-last-2-messages",
    emptyMessages: "remove",
  });
}

export type PrepareCompressedContextOptions = {
  messages: AgentUIMessage[];
  model: LanguageModel;
  contextLimit: number;
  /** Test hook: override LLM summarization of older messages. */
  summarizeOlderMessages?: (
    model: LanguageModel,
    olderMessages: AgentUIMessage[],
  ) => Promise<string | null>;
};

export async function prepareCompressedContext(
  options: PrepareCompressedContextOptions,
): Promise<CompressionPreparation> {
  const { messages, model, contextLimit, summarizeOlderMessages } = options;
  const summarize =
    summarizeOlderMessages
    ?? ((languageModel, olderMessages) => createSummary(languageModel, olderMessages));
  const baseModelMessages = await convertToModelMessages(messages);
  const basePruned = safePruneMessages(baseModelMessages);
  const splitIndex = resolveContextSplitIndex(messages);
  const trigger = splitIndex > 0 && shouldCompressContextMessages(messages, contextLimit);
  if (!trigger) {
    return { modelMessages: basePruned, compressed: false };
  }

  const olderMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);
  if (olderMessages.length === 0 || recentMessages.length === 0) {
    return { modelMessages: basePruned, compressed: false };
  }

  const throughMessageId = olderMessages[olderMessages.length - 1]!.id;
  const reuseSummary = selectReusableContextSummary(messages, splitIndex);
  const summary = reuseSummary ?? (await summarize(model, olderMessages));
  if (!summary) {
    return { modelMessages: basePruned, compressed: false };
  }

  const recentModelMessages = await convertToModelMessages(recentMessages);
  const prunedRecentModelMessages = safePruneMessages(recentModelMessages);
  const sourceInputTokens = latestAssistantUsage(messages)?.inputTokens ?? 0;
  const metadata = buildCompressionMetadata(
    summary,
    throughMessageId,
    sourceInputTokens,
    messages.length,
  );
  return {
    modelMessages: prunedRecentModelMessages,
    systemSuffix: renderCompressionSystemSuffix(summary),
    contextCompression: metadata,
    compressed: true,
  };
}
