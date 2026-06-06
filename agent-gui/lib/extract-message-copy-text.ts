import { isTextUIPart } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { getUserMessageDisplayText } from "@/lib/user-message-edit";

function stripReasoningWrappers(text: string): string {
  return text.replace(/[\s\S]*?<\/think>/gi, "").trim();
}

/** Plain text copied from a chat message (user markup or assistant markdown). */
export function extractMessageCopyText(
  message: AgentUIMessage,
  userTextOverride?: string,
): string {
  if (message.role === "user") {
    return (userTextOverride ?? getUserMessageDisplayText(message)).trim();
  }

  const chunks: string[] = [];
  for (const part of message.parts) {
    if (!isTextUIPart(part)) continue;
    const text = stripReasoningWrappers(part.text.trim());
    if (text) chunks.push(text);
  }
  return chunks.join("\n\n").trim();
}
