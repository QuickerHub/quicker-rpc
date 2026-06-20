import type { ModelMessage } from "ai";

const PREVIEW_NOTE =
  "[older turn: tool output preview; re-run tool or Read if details needed]";

export type SlidingWindowTrimOptions = {
  /** User turns kept at full tool output (from the end). */
  recentUserTurns?: number;
  /** Only trim tool outputs above this char budget (JSON serialized). */
  minOutputChars?: number;
  /** Max chars kept in preview payload. */
  previewChars?: number;
};

export type SlidingWindowTrimResult = {
  messages: ModelMessage[];
  applied: boolean;
  tokensSavedEstimate: number;
};

function estimateChars(value: unknown): number {
  if (value == null) return 0;
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function findProtectedMessageIndex(
  messages: ModelMessage[],
  recentUserTurns: number,
): number {
  let userTurns = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role !== "user") continue;
    userTurns += 1;
    if (userTurns >= recentUserTurns) return i;
  }
  return 0;
}

function previewToolResultOutput(
  output: unknown,
  previewChars: number,
): unknown {
  const serialized = JSON.stringify(output ?? null);
  if (serialized.length <= previewChars) return output;

  if (
    output != null
    && typeof output === "object"
    && "type" in output
    && (output as { type: string }).type === "json"
  ) {
    const typed = output as { type: "json"; value?: unknown };
    const valueStr = JSON.stringify(typed.value ?? null);
    return {
      type: "json",
      value: {
        preview: true,
        note: PREVIEW_NOTE,
        bytesOmitted: Math.max(0, valueStr.length - previewChars),
        tailPreview: valueStr.slice(-previewChars),
      },
    };
  }

  return {
    preview: true,
    note: PREVIEW_NOTE,
    bytesOmitted: serialized.length - previewChars,
    tailPreview: serialized.slice(-previewChars),
  };
}

function trimToolMessage(
  message: ModelMessage,
  options: {
    minOutputChars: number;
    previewChars: number;
  },
): { message: ModelMessage; savedChars: number } {
  if (message.role !== "tool" || !Array.isArray(message.content)) {
    return { message, savedChars: 0 };
  }

  let savedChars = 0;
  let changed = false;
  const content = message.content.map((part) => {
    if (part.type !== "tool-result") return part;
    const before = estimateChars(part.output);
    if (before < options.minOutputChars) return part;
    const nextOutput = previewToolResultOutput(part.output, options.previewChars);
    const after = estimateChars(nextOutput);
    if (after >= before) return part;
    savedChars += before - after;
    changed = true;
    return { ...part, output: nextOutput };
  });

  if (!changed) return { message, savedChars: 0 };
  return { message: { ...message, content }, savedChars };
}

/** Trim large tool outputs in older user turns (model view only; does not touch persisted UI messages). */
export function applySlidingWindowTrim(
  messages: ModelMessage[],
  options?: SlidingWindowTrimOptions,
): SlidingWindowTrimResult {
  const recentUserTurns = options?.recentUserTurns ?? 2;
  const minOutputChars = options?.minOutputChars ?? 2048;
  const previewChars = options?.previewChars ?? 2000;

  if (messages.length === 0) {
    return { messages, applied: false, tokensSavedEstimate: 0 };
  }

  const protectedFrom = findProtectedMessageIndex(messages, recentUserTurns);
  if (protectedFrom <= 0) {
    return { messages, applied: false, tokensSavedEstimate: 0 };
  }

  let savedChars = 0;
  let applied = false;
  const next = messages.map((message, index) => {
    if (index >= protectedFrom) return message;
    const trimmed = trimToolMessage(message, { minOutputChars, previewChars });
    if (trimmed.savedChars > 0) applied = true;
    savedChars += trimmed.savedChars;
    return trimmed.message;
  });

  return {
    messages: applied ? next : messages,
    applied,
    tokensSavedEstimate: Math.ceil(savedChars / 4),
  };
}
