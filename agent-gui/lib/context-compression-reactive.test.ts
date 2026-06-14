import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractErrorMessage,
  isContextLengthExceededError,
  isContextLengthExceededErrorText,
  mergeUIMessageStreamWithReactiveCompact,
} from "@/lib/context-compression-reactive";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { InferUIMessageChunk, UIMessageStreamWriter } from "ai";

function mockWriter(): {
  writer: UIMessageStreamWriter<AgentUIMessage>;
  chunks: InferUIMessageChunk<AgentUIMessage>[];
} {
  const chunks: InferUIMessageChunk<AgentUIMessage>[] = [];
  const writer: UIMessageStreamWriter<AgentUIMessage> = {
    write(part) {
      chunks.push(part);
    },
    merge() {},
    onError: undefined,
  };
  return { writer, chunks };
}

function streamFromChunks(
  chunks: InferUIMessageChunk<AgentUIMessage>[],
): ReadableStream<InferUIMessageChunk<AgentUIMessage>> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe("isContextLengthExceededError", () => {
  it("detects common provider messages", () => {
    assert.ok(
      isContextLengthExceededError(
        new Error("maximum context length is 128000 tokens"),
      ),
    );
    assert.ok(
      isContextLengthExceededError(new Error("prompt is too long for this model")),
    );
    assert.ok(
      isContextLengthExceededError({ message: "context_length_exceeded" }),
    );
  });

  it("walks nested Error.cause", () => {
    const error = new Error("request failed");
    (error as Error & { cause: Error }).cause = new Error("prompt is too long");
    assert.ok(isContextLengthExceededError(error));
  });

  it("ignores unrelated failures", () => {
    assert.equal(isContextLengthExceededError(new Error("rate limit exceeded")), false);
    assert.equal(isContextLengthExceededErrorText("network timeout"), false);
  });
});

describe("extractErrorMessage", () => {
  it("joins API error object fields", () => {
    const message = extractErrorMessage({
      message: "Bad Request",
      error: "context length exceeded",
    });
    assert.match(message, /context length exceeded/i);
  });
});

describe("mergeUIMessageStreamWithReactiveCompact", () => {
  it("requests retry when context error arrives before visible content", async () => {
    const { writer } = mockWriter();
    const stream = streamFromChunks([
      { type: "start" },
      { type: "error", errorText: "prompt is too long" },
    ]);
    const reader = stream.getReader();
    const result = await mergeUIMessageStreamWithReactiveCompact(
      reader,
      writer,
      { allowReactiveRetry: true },
    );
    assert.equal(result.action, "retry");
  });

  it("forwards error when content was already streamed", async () => {
    const { writer, chunks } = mockWriter();
    const stream = streamFromChunks([
      { type: "start" },
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", delta: "hi" },
      { type: "error", errorText: "maximum context length exceeded" },
    ]);
    const reader = stream.getReader();
    const result = await mergeUIMessageStreamWithReactiveCompact(
      reader,
      writer,
      { allowReactiveRetry: true },
    );
    assert.equal(result.action, "done");
    assert.ok(chunks.some((chunk) => chunk.type === "error"));
  });

  it("forwards error when reactive retry is disabled", async () => {
    const { writer, chunks } = mockWriter();
    const stream = streamFromChunks([
      { type: "error", errorText: "prompt is too long" },
    ]);
    const reader = stream.getReader();
    const result = await mergeUIMessageStreamWithReactiveCompact(
      reader,
      writer,
      { allowReactiveRetry: false },
    );
    assert.equal(result.action, "done");
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.type, "error");
  });
});
