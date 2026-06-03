import {
  isToolOrDynamicToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";

type AgentUIMessagePart = AgentUIMessage["parts"][number];
type AgentToolUIPart = ToolUIPart | DynamicToolUIPart;

export const INTERRUPTED_TOOL_ERROR_TEXT =
  "Stopped by user before the tool finished.";

export function isIncompleteToolPart(
  part: AgentUIMessagePart,
): part is AgentToolUIPart {
  if (!isToolOrDynamicToolUIPart(part)) return false;
  return (
    part.state === "input-streaming"
    || part.state === "input-available"
    || part.state === "approval-requested"
  );
}

export function hasIncompleteToolCalls(messages: AgentUIMessage[]): boolean {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (isIncompleteToolPart(part)) return true;
    }
  }
  return false;
}

/** Resolve tool parts left mid-flight after the user stops generation. */
export function repairInterruptedToolCalls(
  messages: AgentUIMessage[],
): AgentUIMessage[] {
  let changed = false;

  const next = messages.map((message) => {
    if (message.role !== "assistant") return message;

    let messageChanged = false;
    const parts = message.parts.map((part) => {
      if (!isIncompleteToolPart(part)) return part;

      messageChanged = true;

      if (
        part.state === "approval-requested"
        && "approval" in part
        && part.approval
      ) {
        return {
          ...part,
          state: "output-denied" as const,
          approval: {
            ...part.approval,
            approved: false as const,
            reason: INTERRUPTED_TOOL_ERROR_TEXT,
          },
        } satisfies AgentUIMessagePart;
      }

      const input = "input" in part ? part.input : undefined;
      const { approval: _ignoredApproval, ...rest } = part;
      return {
        ...rest,
        state: "output-error" as const,
        input,
        errorText: INTERRUPTED_TOOL_ERROR_TEXT,
      } satisfies AgentUIMessagePart;
    });

    if (!messageChanged) return message;
    changed = true;
    return { ...message, parts };
  });

  return changed ? next : messages;
}
