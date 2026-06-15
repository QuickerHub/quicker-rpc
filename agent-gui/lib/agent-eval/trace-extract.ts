import type { AgentUIMessage } from "@/lib/chat-types";
import type { AgentEvalToolCall } from "@/lib/agent-eval/types";

function readToolName(partType: string): string {
  return partType.startsWith("tool-") ? partType.slice("tool-".length) : partType;
}

function isToolPart(
  part: AgentUIMessage["parts"][number],
): part is AgentUIMessage["parts"][number] & {
  state: string;
  input?: unknown;
} {
  return part.type.startsWith("tool-") && "state" in part;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

/** Ordered tool invocations from assistant messages (deduped by toolCallId). */
export function extractToolTrace(messages: AgentUIMessage[]): AgentEvalToolCall[] {
  const seen = new Set<string>();
  const trace: AgentEvalToolCall[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (!isToolPart(part)) continue;
      const toolCallId =
        "toolCallId" in part && typeof part.toolCallId === "string"
          ? part.toolCallId
          : `${part.type}:${trace.length}`;
      if (seen.has(toolCallId)) continue;
      seen.add(toolCallId);
      trace.push({
        toolName: readToolName(part.type),
        state: part.state,
        input: asRecord(part.input),
      });
    }
  }

  return trace;
}

export function extractAssistantText(messages: AgentUIMessage[]): string {
  const chunks: string[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }
  return chunks.join("\n\n");
}

const GUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function extractLastActionId(text: string): string | null {
  const matches = text.match(GUID_RE);
  return matches?.at(-1) ?? null;
}
