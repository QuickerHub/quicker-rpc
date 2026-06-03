import type { AgentUIMessage } from "@/lib/chat-types";

/** Start index of every user message (each begins a conversation turn). */
export function findUserTurnStartIndices(messages: AgentUIMessage[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") indices.push(i);
  }
  return indices;
}

/** Index of the last user message; messages from here form the active turn. */
export function findLastUserTurnStartIndex(messages: AgentUIMessage[]): number {
  const indices = findUserTurnStartIndices(messages);
  return indices.length > 0 ? indices[indices.length - 1]! : -1;
}
