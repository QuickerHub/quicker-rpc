import { NoSuchToolError } from "ai";

/** Minimal tool-call shape for experimental_repairToolCall (avoids non-exported ai SDK types). */
export type RepairableToolCall = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: string;
  providerExecuted?: boolean;
};

/** Harmony / GPT-OSS style tokens that some models leak into tool names. */
export const MODEL_CHANNEL_MARKER_RE = /<\|channel\|>\w+/gi;

export function stripModelChannelMarkers(text: string): string {
  return text.replace(MODEL_CHANNEL_MARKER_RE, "").replace(/\s{2,}/g, " ").trim();
}

/** Normalize a raw model tool name to a registry id candidate. */
export function normalizeToolCallName(raw: string): string {
  const stripped = stripModelChannelMarkers(raw);
  if (!stripped) return "";
  if (stripped.includes("_")) return stripped;
  return stripped.toLowerCase().replace(/\s+/g, "_");
}

/**
 * Map a corrupted / aliased tool name to a known tool id.
 * Uses longest-id prefix match so qkrpc_action_query beats qkrpc_action.
 */
export function resolveKnownToolName(
  rawName: string,
  toolIds: readonly string[],
): string | null {
  const normalized = normalizeToolCallName(rawName);
  if (!normalized) return null;

  const sorted = [...toolIds].sort((a, b) => b.length - a.length);
  if (sorted.includes(normalized)) return normalized;

  for (const id of sorted) {
    if (normalized === id || normalized.startsWith(`${id}_`)) {
      return id;
    }
  }

  for (const id of sorted) {
    if (normalized.startsWith(id)) return id;
  }

  return null;
}

export type RepairToolCallOptions = {
  toolCall: RepairableToolCall;
  tools: Record<string, unknown>;
  error: NoSuchToolError | { name: string };
};

/** Repair tool calls when models append channel tokens to tool names. */
export function repairCorruptedToolCall({
  toolCall,
  tools,
  error,
}: RepairToolCallOptions): RepairableToolCall | null {
  if (!NoSuchToolError.isInstance(error)) return null;

  const toolIds = Object.keys(tools);
  const repairedName = resolveKnownToolName(toolCall.toolName, toolIds);
  if (!repairedName || repairedName === toolCall.toolName) return null;

  return {
    ...toolCall,
    toolName: repairedName,
  };
}

export function createRepairToolCallHandler<T extends Record<string, unknown>>(
  tools: T,
) {
  return async (options: {
    toolCall: RepairableToolCall;
    tools: T;
    error: unknown;
  }): Promise<RepairableToolCall | null> =>
    repairCorruptedToolCall({
      toolCall: options.toolCall,
      tools: options.tools,
      error: options.error as NoSuchToolError,
    });
}
