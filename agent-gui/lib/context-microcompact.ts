import type { AgentUIMessage } from "@/lib/chat-types";
import { groupMessagesIntoApiRounds } from "@/lib/context-api-rounds";
import {
  estimateMessageTokens,
  estimatePartTokens,
} from "@/lib/context-token-estimate";
import { buildMicrocompactPayloadFromAgentView } from "@/lib/tool-result-agent-view";

const COMPACT_PLACEHOLDER = "[compact: large tool output omitted; see recent turns]";

export type MicrocompactResult = {
  messages: AgentUIMessage[];
  tokensSavedEstimate: number;
  applied: boolean;
};

function isToolPartWithOutput(
  part: AgentUIMessage["parts"][number],
): part is AgentUIMessage["parts"][number] & {
  state: string;
  output?: unknown;
} {
  return part.type.startsWith("tool-") && "state" in part;
}

function compactToolOutput(
  part: AgentUIMessage["parts"][number] & { output?: unknown },
): unknown {
  if (part.output == null || typeof part.output !== "object") {
    return part.output;
  }
  const out = part.output as Record<string, unknown>;
  if ("agentView" in out || typeof out.summary === "string") {
    return buildMicrocompactPayloadFromAgentView(out);
  }
  const compact: Record<string, unknown> = {
    compact: true,
    note: COMPACT_PLACEHOLDER,
  };
  for (const key of ["ok", "exitCode", "errorMessage", "actionId", "path", "action"]) {
    if (key in out) compact[key] = out[key];
  }
  const data = out.data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (record.actionId != null) compact.actionId = record.actionId;
  }
  return compact;
}

function shouldCompactPart(
  part: AgentUIMessage["parts"][number],
  minOutputTokens: number,
): boolean {
  if (!isToolPartWithOutput(part)) return false;
  if (part.state !== "output-available") return false;
  if (part.type === "tool-ask_question") return false;
  return estimatePartTokens(part) >= minOutputTokens;
}

/** Shrink large tool outputs in messages before splitIndex (older history). */
export function microcompactToolOutputs(
  messages: AgentUIMessage[],
  options: {
    splitIndex: number;
    protectRecentRounds?: number;
    minOutputTokens?: number;
  },
): MicrocompactResult {
  const protectRecentRounds = options.protectRecentRounds ?? 2;
  const minOutputTokens = options.minOutputTokens ?? 512;
  const splitIndex = options.splitIndex;
  if (splitIndex <= 0) {
    return { messages, tokensSavedEstimate: 0, applied: false };
  }

  const rounds = groupMessagesIntoApiRounds(messages);
  const protectedFromIndex = Math.max(
    0,
    rounds.length - protectRecentRounds,
  );
  const protectedFlatIndex = roundStartIndexFromRounds(rounds, protectedFromIndex);

  let tokensSavedEstimate = 0;
  let applied = false;
  const next = messages.map((message, index) => {
    if (index >= splitIndex || index >= protectedFlatIndex) return message;
    let messageChanged = false;
    const parts = message.parts.map((part) => {
      if (!shouldCompactPart(part, minOutputTokens)) return part;
      const before = estimatePartTokens(part);
      messageChanged = true;
      const cloned = {
        ...part,
        output: compactToolOutput(part),
      } as AgentUIMessage["parts"][number];
      tokensSavedEstimate += Math.max(0, before - estimatePartTokens(cloned));
      return cloned;
    });
    if (!messageChanged) return message;
    applied = true;
    return { ...message, parts };
  });

  return {
    messages: applied ? next : messages,
    tokensSavedEstimate,
    applied,
  };
}

function roundStartIndexFromRounds(
  rounds: AgentUIMessage[][],
  roundIndex: number,
): number {
  if (roundIndex <= 0) return 0;
  let idx = 0;
  for (let i = 0; i < roundIndex && i < rounds.length; i += 1) {
    idx += rounds[i]!.length;
  }
  return idx;
}
