import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { getToolMeta } from "@/lib/tool-registry";
import type { PendingToolApproval } from "@/lib/tool-approval-display";

export function collectPendingApprovals(
  messages: AgentUIMessage[],
): PendingToolApproval[] {
  const pending: PendingToolApproval[] = [];

  let startIndex = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      startIndex = i;
      break;
    }
  }

  for (let i = startIndex; i < messages.length; i += 1) {
    const message = messages[i]!;
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (
        !isToolOrDynamicToolUIPart(part)
        || part.state !== "approval-requested"
        || !("approval" in part)
        || !part.approval?.id
      ) {
        continue;
      }

      const toolName = getToolOrDynamicToolName(part);
      const meta = getToolMeta(toolName);
      pending.push({
        id: part.approval.id,
        toolName,
        label: meta?.label ?? toolName.replace(/^qkrpc_/, "").replace(/_/g, " "),
        input: "input" in part ? part.input : undefined,
        destructive: meta?.group === "destructive",
      });
    }
  }

  return pending;
}
