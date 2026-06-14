import type { ModelMessage } from "ai";
import {
  resolveCompactionEstimateThreshold,
} from "@/lib/context-compression-shared";

const COMPACT_PLACEHOLDER =
  "[compact: large tool output omitted; see recent tool results]";
const BASE_MESSAGE_OVERHEAD = 8;
const STEP_MICROCOMPACT_TRIGGER_RATIO = 0.85;

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function estimateModelMessageTokens(message: ModelMessage): number {
  let tokens = Math.ceil((message.role.length + BASE_MESSAGE_OVERHEAD) / 4);
  if (typeof message.content === "string") {
    tokens += Math.ceil(message.content.length / 4);
    return tokens;
  }
  tokens += Math.ceil(JSON.stringify(message.content).length / 4);
  return tokens;
}

export function estimateModelMessagesTokens(messages: ModelMessage[]): number {
  return messages.reduce(
    (sum, message) => sum + estimateModelMessageTokens(message),
    0,
  );
}

function compactJsonToolValue(value: unknown): unknown {
  const record = readRecord(value);
  if (!record) return value;
  const compact: Record<string, unknown> = {
    compact: true,
    note: COMPACT_PLACEHOLDER,
  };
  for (const key of ["ok", "exitCode", "errorMessage", "actionId", "path", "action"]) {
    if (key in record) compact[key] = record[key];
  }
  const data = record.data;
  if (data && typeof data === "object") {
    const nested = data as Record<string, unknown>;
    if (nested.actionId != null) compact.actionId = nested.actionId;
  }
  return compact;
}

function compactToolResultOutput(output: unknown): unknown {
  if (output != null && typeof output === "object" && "type" in output) {
    const typed = output as { type: string; value?: unknown };
    if (typed.type === "json") {
      return { ...typed, value: compactJsonToolValue(typed.value) };
    }
    if (typed.type === "text" && typeof typed.value === "string") {
      return {
        ...typed,
        value: `${COMPACT_PLACEHOLDER} (${typed.value.length} chars omitted)`,
      };
    }
  }
  return compactJsonToolValue(output);
}

function estimateToolResultPartTokens(part: {
  output?: unknown;
}): number {
  return Math.ceil(JSON.stringify(part.output ?? null).length / 4);
}

function compactToolResultPart<T extends { output?: unknown }>(
  part: T,
  minOutputTokens: number,
): T {
  if (estimateToolResultPartTokens(part) < minOutputTokens) return part;
  return {
    ...part,
    output: compactToolResultOutput(part.output) as T["output"],
  };
}

export type StepMicrocompactResult = {
  messages: ModelMessage[];
  applied: boolean;
  tokensSavedEstimate: number;
};

/** Shrink older tool results between multi-step streamText calls. */
export function microcompactStepModelMessages(
  messages: ModelMessage[],
  options?: {
    protectRecentToolResults?: number;
    minOutputTokens?: number;
  },
): StepMicrocompactResult {
  const protectRecentToolResults = options?.protectRecentToolResults ?? 2;
  const minOutputTokens = options?.minOutputTokens ?? 512;

  const toolResultIndexes: Array<{ messageIndex: number; partIndex: number }> = [];
  messages.forEach((message, messageIndex) => {
    if (message.role !== "tool" || !Array.isArray(message.content)) return;
    message.content.forEach((part, partIndex) => {
      if (part.type !== "tool-result") return;
      toolResultIndexes.push({ messageIndex, partIndex });
    });
  });

  if (toolResultIndexes.length <= protectRecentToolResults) {
    return { messages, applied: false, tokensSavedEstimate: 0 };
  }

  const compactIndexes = new Set(
    toolResultIndexes
      .slice(0, toolResultIndexes.length - protectRecentToolResults)
      .map((item) => `${item.messageIndex}:${item.partIndex}`),
  );

  let tokensSavedEstimate = 0;
  let applied = false;
  const next = messages.map((message, messageIndex) => {
    if (message.role !== "tool" || !Array.isArray(message.content)) {
      return message;
    }
    let messageChanged = false;
    const content = message.content.map((part, partIndex) => {
      if (part.type !== "tool-result") return part;
      if (!compactIndexes.has(`${messageIndex}:${partIndex}`)) return part;
      const before = estimateToolResultPartTokens(part);
      const compacted = compactToolResultPart(part, minOutputTokens);
      if (compacted === part) return part;
      messageChanged = true;
      tokensSavedEstimate += Math.max(
        0,
        before - estimateToolResultPartTokens(compacted),
      );
      return compacted;
    });
    if (!messageChanged) return message;
    applied = true;
    return { ...message, content };
  });

  return {
    messages: applied ? next : messages,
    applied,
    tokensSavedEstimate,
  };
}

export function shouldMicrocompactStepMessages(
  messages: ModelMessage[],
  contextLimit: number,
): boolean {
  if (contextLimit <= 0 || messages.length === 0) return false;
  const threshold = Math.floor(
    resolveCompactionEstimateThreshold(contextLimit) * STEP_MICROCOMPACT_TRIGGER_RATIO,
  );
  return estimateModelMessagesTokens(messages) >= threshold;
}

export type StepMicrocompactPrepareStepOptions = {
  contextLimit: number;
  /** Skip step-0; only compact after at least one tool step. */
  minStepNumber?: number;
};

/** prepareStep hook: microcompact older tool results when a turn grows large. */
export function createStepMicrocompactPrepareStep(
  options: StepMicrocompactPrepareStepOptions,
) {
  const minStepNumber = options.minStepNumber ?? 1;
  return ({
    stepNumber,
    messages,
  }: {
    stepNumber: number;
    messages: ModelMessage[];
  }) => {
    if (stepNumber < minStepNumber) return undefined;
    if (!shouldMicrocompactStepMessages(messages, options.contextLimit)) {
      return undefined;
    }
    const compact = microcompactStepModelMessages(messages);
    if (!compact.applied) return undefined;
    return { messages: compact.messages };
  };
}
