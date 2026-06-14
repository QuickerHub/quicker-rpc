import type { AgentUIMessage } from "@/lib/chat-types";

export type ApiRound = AgentUIMessage[];

/** Split thread into user-anchored rounds for split/microcompact boundaries. */
export function groupMessagesIntoApiRounds(
  messages: AgentUIMessage[],
): ApiRound[] {
  const rounds: ApiRound[] = [];
  let current: ApiRound = [];
  for (const message of messages) {
    if (message.role === "user" && current.length > 0) {
      rounds.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.length > 0) rounds.push(current);
  return rounds;
}

/** Flat index of the first message in round N (0-based). */
export function roundStartIndex(
  messages: AgentUIMessage[],
  roundIndex: number,
): number {
  if (roundIndex <= 0) return 0;
  const rounds = groupMessagesIntoApiRounds(messages);
  let idx = 0;
  for (let i = 0; i < roundIndex && i < rounds.length; i += 1) {
    idx += rounds[i]!.length;
  }
  return idx;
}

/** Move split index backward to a user message (keeps tool pairs intact). */
export function alignSplitIndexToRoundStart(
  messages: AgentUIMessage[],
  splitIndex: number,
): number {
  if (splitIndex <= 0) return 0;
  let aligned = splitIndex;
  while (aligned > 0 && messages[aligned]?.role !== "user") {
    aligned -= 1;
  }
  return aligned;
}
