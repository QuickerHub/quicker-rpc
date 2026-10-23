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
  options: {
    allowReactiveRetry: boolean;
    abortSignal?: AbortSignal;
    /** Stop the producer before cancelling its reader (SDK streams may use tee). */
    onRetry?: () => void;
    /** Release the producer before reader cancellation if the consumer/writer fails. */
    onStreamError?: (error: unknown) => void;
  },
): Promise<MergeWithReactiveCompactResult> {
  let sentUserVisible = false;
  const onAbort = () => { void reader.cancel(options.abortSignal?.reason).catch(() => {}); };
  options.abortSignal?.addEventListener("abort", onAbort, { once: true });
  try {
    options.abortSignal?.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      options.abortSignal?.throwIfAborted();
      if (done) return { action: "done" };

      if (value.type === "error") {
        if (
          options.allowReactiveRetry
          && !sentUserVisible
          && isContextLengthExceededErrorText(value.errorText)
        ) {
          options.onRetry?.();
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
  } catch (error) {
    try { options.onStreamError?.(error); } catch { /* Preserve the stream's original failure. */ }
    throw error;
  } finally {
    options.abortSignal?.removeEventListener("abort", onAbort);
    try { await reader.cancel(); } catch { /* Keep the original stream/abort error. */ }
    reader.releaseLock();
  }
}
