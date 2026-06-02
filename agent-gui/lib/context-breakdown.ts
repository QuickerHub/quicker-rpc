import {
  isTextUIPart,
  isToolOrDynamicToolUIPart,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { buildSystemInstructions } from "@/lib/instructions";
import {
  formatCharLength,
  formatContextWindowLabel,
  getLatestContextUsage,
} from "@/lib/context-length";
import {
  getToolMeta,
} from "@/lib/tool-registry";

export type ContextSegmentId = "system" | "tools" | "conversation";

export type ContextSegment = {
  id: ContextSegmentId;
  label: string;
  chars: number;
  /** CSS color for legend swatch and bar segment. */
  color: string;
};

export const CONTEXT_SEGMENT_COLORS: Record<ContextSegmentId, string> = {
  system: "#8b8b8b",
  tools: "#a855f7",
  conversation: "#4f8cff",
};

/** Fallback when server sizes are not loaded yet (much lower than old heuristic). */
const FALLBACK_TOOL_CHARS: Record<string, number> = {
  read: 320,
  write: 420,
  destructive: 360,
};

function measureJsonChars(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}

function measureMessagePartsChars(messages: AgentUIMessage[]): number {
  let total = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (isTextUIPart(part)) {
        total += part.text.length;
      } else if (isToolOrDynamicToolUIPart(part)) {
        total += measureJsonChars(part.input);
        total += measureJsonChars(part.output);
        if ("errorText" in part && typeof part.errorText === "string") {
          total += part.errorText.length;
        }
      }
    }
  }
  return total;
}

/** Tool JSON-schema payload; prefer server-measured sizes when available. */
export function measureEnabledToolsCharLength(
  enabledToolIds: string[],
  sizeById?: Record<string, number>,
): number {
  let total = 0;
  for (const id of enabledToolIds) {
    if (sizeById && sizeById[id] !== undefined) {
      total += sizeById[id];
      continue;
    }
    const meta = getToolMeta(id);
    if (!meta) continue;
    total += FALLBACK_TOOL_CHARS[meta.group];
  }
  return total;
}

export function measureSystemPromptChars(workingDirectory?: string): number {
  return buildSystemInstructions(workingDirectory?.trim() || undefined).length;
}

export function buildContextSegments(input: {
  messages: AgentUIMessage[];
  workingDirectory?: string;
  enabledToolIds: string[];
  toolDefinitionSizes?: Record<string, number>;
}): ContextSegment[] {
  const systemChars = measureSystemPromptChars(input.workingDirectory);
  const toolsChars = measureEnabledToolsCharLength(
    input.enabledToolIds,
    input.toolDefinitionSizes,
  );
  const conversationChars = measureMessagePartsChars(input.messages);

  const segments: ContextSegment[] = [
    {
      id: "system",
      label: "系统提示",
      chars: systemChars,
      color: CONTEXT_SEGMENT_COLORS.system,
    },
    {
      id: "tools",
      label: "工具定义",
      chars: toolsChars,
      color: CONTEXT_SEGMENT_COLORS.tools,
    },
    {
      id: "conversation",
      label: "对话",
      chars: conversationChars,
      color: CONTEXT_SEGMENT_COLORS.conversation,
    },
  ];

  return segments.filter((segment) => segment.chars > 0);
}

/** Char budget heuristic for comparing against model token window. */
export function contextWindowCharBudget(tokenLimit: number): number {
  return Math.round(tokenLimit * 3.5);
}

export type ContextUsageSnapshot = {
  segments: ContextSegment[];
  totalChars: number;
  windowLabel: string;
  windowCharBudget: number;
  pct: number;
  hasData: boolean;
  warn: boolean;
};

export function buildContextUsageSnapshot(input: {
  messages: AgentUIMessage[];
  workingDirectory?: string;
  enabledToolIds: string[];
  tokenLimit: number;
  toolDefinitionSizes?: Record<string, number>;
}): ContextUsageSnapshot {
  const segments = buildContextSegments(input);
  const totalChars = segments.reduce((sum, segment) => sum + segment.chars, 0);
  const windowCharBudget = contextWindowCharBudget(input.tokenLimit);
  const windowLabel = formatContextWindowLabel(input.tokenLimit);
  const latestUsage = getLatestContextUsage(input.messages);

  const pctFromApi =
    latestUsage && latestUsage.inputTokens > 0 && input.tokenLimit > 0
      ? Math.min(100, (latestUsage.inputTokens / input.tokenLimit) * 100)
      : 0;
  const pctFromChars =
    totalChars > 0 && windowCharBudget > 0
      ? Math.min(100, (totalChars / windowCharBudget) * 100)
      : 0;
  const pct = pctFromApi > 0 ? pctFromApi : pctFromChars;
  const hasData = totalChars > 0 || pctFromApi > 0;

  return {
    segments,
    totalChars,
    windowLabel,
    windowCharBudget,
    pct,
    hasData,
    warn: pct >= 90,
  };
}

export { formatCharLength };
