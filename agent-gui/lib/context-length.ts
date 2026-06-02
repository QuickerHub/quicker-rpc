import {
  isTextUIPart,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";

/** Base system prompt (buildSystemInstructions without cwd). */
const ESTIMATED_SYSTEM_PROMPT_CHARS = 2_800;
const WORKING_DIR_LINE_CHARS = 72;

function measureJsonChars(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

/** Approximate serialized size of one UI message part. */
function measurePartChars(part: UIMessage["parts"][number]): number {
  if (isTextUIPart(part)) {
    return part.text.length;
  }
  if (isToolOrDynamicToolUIPart(part)) {
    let total = measureJsonChars(part.input);
    total += measureJsonChars(part.output);
    if ("errorText" in part && typeof part.errorText === "string") {
      total += part.errorText.length;
    }
    return total;
  }
  return 0;
}

/**
 * Measure conversation payload size in characters (user + assistant + tools),
 * plus a fixed estimate for the server-side system prompt.
 */
export function measureConversationCharLength(
  messages: AgentUIMessage[],
  options?: { workingDirectory?: string },
): number {
  let total = ESTIMATED_SYSTEM_PROMPT_CHARS;
  const cwd = options?.workingDirectory?.trim();
  if (cwd) {
    total += WORKING_DIR_LINE_CHARS + cwd.length;
  }

  for (const message of messages) {
    for (const part of message.parts) {
      total += measurePartChars(part);
    }
  }

  return total;
}

/** Human-readable character count (e.g. 485K, 1.2M). */
export function formatCharLength(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

/** Model context window label from token catalog (e.g. 272K), not a token count. */
export function formatContextWindowLabel(tokenLimit: number): string {
  if (tokenLimit >= 1_000_000) {
    const m = tokenLimit / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (tokenLimit >= 1000) {
    return `${Math.round(tokenLimit / 1000)}K`;
  }
  return String(tokenLimit);
}

/** Latest assistant turn: API-reported context fill (not summed across turns). */
export function getLatestContextUsage(
  messages: AgentUIMessage[],
): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "assistant") continue;
    const meta = message.metadata;
    if (!meta) continue;

    const hasUsage =
      meta.inputTokens !== undefined
      || meta.outputTokens !== undefined
      || meta.totalTokens !== undefined;
    if (!hasUsage) continue;

    const inputTokens = meta.inputTokens ?? 0;
    const outputTokens = meta.outputTokens ?? 0;
    const totalTokens =
      meta.totalTokens ?? (inputTokens + outputTokens > 0 ? inputTokens + outputTokens : 0);

    return { inputTokens, outputTokens, totalTokens };
  }
  return null;
}
