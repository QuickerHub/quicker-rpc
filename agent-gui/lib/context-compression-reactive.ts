import type { InferUIMessageChunk, UIMessageStreamWriter } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";

/** Provider / SDK phrases for prompt or context window overflow. */
const CONTEXT_LENGTH_ERROR_RE =
  /context\s*length|context_length|maximum\s+context|max(?:imum)?\s+tokens|prompt\s+(?:is\s+)?too\s+long|token\s+limit|context\s+window|reduce\s+(?:the\s+)?length|too\s+many\s+tokens|input\s+token\s+count/i;

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause != null
      ? extractErrorMessage(error.cause)
      : "";
    return [error.message, cause].filter(Boolean).join(" ");
  }
  if (typeof error === "string") return error;
  if (error != null && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.error, record.code, record.type]
      .filter((value): value is string => typeof value === "string");
    if (parts.length > 0) return parts.join(" ");
  }
  return String(error ?? "");
}

export function isContextLengthExceededError(error: unknown): boolean {
  return CONTEXT_LENGTH_ERROR_RE.test(extractErrorMessage(error));
}

export function isContextLengthExceededErrorText(errorText: string): boolean {
  return CONTEXT_LENGTH_ERROR_RE.test(errorText);
}

function isUserVisibleStreamChunk(chunk: { type: string }): boolean {
  return chunk.type !== "start"
    && chunk.type !== "start-step"
    && chunk.type !== "message-metadata";
}

export type MergeWithReactiveCompactResult =
  | { action: "done" }
  | { action: "retry" };

/**
 * Pipe a streamText UI stream into the chat writer.
 * When context-length fails before any user-visible chunk, signal retry instead of forwarding the error.
 */
export async function mergeUIMessageStreamWithReactiveCompact(
  reader: ReadableStreamDefaultReader<
    InferUIMessageChunk<AgentUIMessage>
  >,
  writer: UIMessageStreamWriter<AgentUIMessage>,
  options: { allowReactiveRetry: boolean },
): Promise<MergeWithReactiveCompactResult> {
  let sentUserVisible = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) return { action: "done" };

    if (value.type === "error") {
      if (
        options.allowReactiveRetry
        && !sentUserVisible
        && isContextLengthExceededErrorText(value.errorText)
      ) {
        return { action: "retry" };
      }
      writer.write(value);
      continue;
    }

    if (isUserVisibleStreamChunk(value)) {
      sentUserVisible = true;
    }
    writer.write(value);
  }
}
