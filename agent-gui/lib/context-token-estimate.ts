import { isTextUIPart } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";

const BASE_MESSAGE_OVERHEAD = 8;

/** Rough token estimate for one message part (not provider-exact). */
export function estimatePartTokens(
  part: AgentUIMessage["parts"][number],
): number {
  if (isTextUIPart(part)) {
    return Math.ceil(part.text.length / 4);
  }
  if (part.type === "reasoning" && "text" in part) {
    return Math.ceil(String(part.text).length / 4);
  }
  const raw = JSON.stringify(part);
  return Math.ceil(raw.length / 4);
}

/** Rough token estimate for budgeting split/microcompact decisions. */
export function estimateMessageTokens(message: AgentUIMessage): number {
  let tokens = Math.ceil((message.role.length + BASE_MESSAGE_OVERHEAD) / 4);
  for (const part of message.parts) {
    tokens += estimatePartTokens(part);
  }
  return tokens;
}

export function estimateThreadTokens(messages: AgentUIMessage[]): number {
  return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}
