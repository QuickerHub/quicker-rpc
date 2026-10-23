import assert from "node:assert/strict";
import test from "node:test";
import { tool, type InferUIMessageChunk, type UIMessageStreamWriter } from "ai";
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { z } from "zod";
import type { AgentUIMessage } from "@/lib/chat-types";
import { runAgentStreamLoopCore } from "./stream-loop";
import { syntheticTurn } from "./turn-test-fixtures";

const usage = {
  inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const finish = (reason: "stop" | "tool-calls" = "stop"): LanguageModelV3StreamPart => ({
  type: "finish", finishReason: { unified: reason, raw: reason }, usage,
});
const text: LanguageModelV3StreamPart[] = [
  { type: "text-start", id: "text" },
  { type: "text-delta", id: "text", delta: "fixture answer" },
  { type: "text-end", id: "text" }, finish(),
];
function writerFixture() {
  const chunks: InferUIMessageChunk<AgentUIMessage>[] = [];
  const writer: UIMessageStreamWriter<AgentUIMessage> = {
    write: (chunk) => { chunks.push(chunk); }, merge() {}, onError: undefined,
  };
  return { writer, chunks };
}

test("real SDK loop executes a fake tool then text, with an injected usage sink", async () => {
  const fixture = syntheticTurn();
  const output = writerFixture();
  let calls = 0;
  let usageCalls = 0;
  const responses = [
    { stream: convertArrayToReadableStream<LanguageModelV3StreamPart>([
      { type: "tool-call", toolCallId: "call", toolName: "echo", input: '{"text":"fixture"}' },
      finish("tool-calls"),
    ]) },
    { stream: convertArrayToReadableStream(text) },
  ];
  let responseIndex = 0;
  const model = new MockLanguageModelV3({ doStream: async () => responses[responseIndex++]! });
  const prepared = await runAgentStreamLoopCore({ ...fixture.runtime, ...output, model, tools: {
    echo: tool({ inputSchema: z.object({ text: z.string() }), execute: async ({ text }) => {
      calls += 1; assert.equal(text, "fixture"); return "echoed";
    } }),
  } }, {
    recordUsage: () => { usageCalls += 1; },
    prepareContext: async () => { throw new Error("unexpected compression"); },
  });
  assert.equal(calls, 1);
  assert.equal(model.doStreamCalls.length, 2);
  assert.equal(usageCalls, 1);
  assert.ok(output.chunks.some((chunk) => chunk.type === "tool-output-available"));
  assert.ok(output.chunks.some((chunk) => chunk.type === "text-delta" && chunk.delta === "fixture answer"));
  assert.equal(prepared, fixture.runtime.preparedContext);
});

test("parent abort interrupts a stalled provider without starting a retry", async () => {
  const fixture = syntheticTurn();
  const output = writerFixture();
  const parent = new AbortController();
  let ready!: () => void;
  const started = new Promise<void>((resolve) => { ready = resolve; });
  let providerSignal: AbortSignal | undefined;
  const model = new MockLanguageModelV3({ doStream: async ({ abortSignal }) => {
    providerSignal = abortSignal;
    return { stream: new ReadableStream<LanguageModelV3StreamPart>({ start(controller) {
      abortSignal!.addEventListener("abort", () => controller.error(abortSignal!.reason), { once: true });
      ready();
    } }) };
  } });
  const result = runAgentStreamLoopCore({ ...fixture.runtime, ...output, model, abortSignal: parent.signal }, {
    recordUsage: () => {}, prepareContext: async () => { throw new Error("must not retry"); },
  });
  await started;
  parent.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(providerSignal?.aborted, true);
  assert.equal(model.doStreamCalls.length, 1);
});

test("parent abort reaches an executing SDK tool and prevents the next model step", async () => {
  const fixture = syntheticTurn();
  const output = writerFixture();
  const parent = new AbortController();
  let ready!: () => void;
  const started = new Promise<void>((resolve) => { ready = resolve; });
  let toolSignal: AbortSignal | undefined;
  const model = new MockLanguageModelV3({ doStream: { stream: convertArrayToReadableStream<LanguageModelV3StreamPart>([
    { type: "tool-call", toolCallId: "call", toolName: "stall", input: "{}" }, finish("tool-calls"),
  ]) } });
  const result = runAgentStreamLoopCore({ ...fixture.runtime, ...output, model, abortSignal: parent.signal, tools: {
    stall: tool({ inputSchema: z.object({}), execute: async (_input, { abortSignal }) => {
      toolSignal = abortSignal;
      ready();
      await new Promise<void>((resolve) => abortSignal!.addEventListener("abort", () => resolve(), { once: true }));
      abortSignal!.throwIfAborted();
    } }),
  } }, { recordUsage: () => {}, prepareContext: async () => { throw new Error("must not retry"); } });
  await started;
  parent.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(toolSignal?.aborted, true);
  assert.equal(model.doStreamCalls.length, 1);
});

test("reactive compaction cancels the rejected attempt before a single retry", async () => {
  const fixture = syntheticTurn();
  const output = writerFixture();
  let firstSignal: AbortSignal | undefined;
  let compressionCalls = 0;
  let attempt = 0;
  const model = new MockLanguageModelV3({ doStream: async ({ abortSignal }) => {
    attempt += 1;
    if (attempt === 1) {
      firstSignal = abortSignal;
      return { stream: new ReadableStream<LanguageModelV3StreamPart>({ start(controller) {
        controller.enqueue({ type: "error", error: new Error("maximum context length exceeded") });
        // Keep the provider open to catch cancellation of only one SDK tee branch.
        abortSignal!.addEventListener("abort", () => controller.close(), { once: true });
      } }) };
    }
    return { stream: convertArrayToReadableStream(text) };
  } });
  await runAgentStreamLoopCore({ ...fixture.runtime, ...output, model }, {
    recordUsage: () => {},
    prepareContext: async () => {
      compressionCalls += 1;
      assert.equal(firstSignal?.aborted, true);
      return fixture.runtime.preparedContext;
    },
  });
  assert.equal(compressionCalls, 1);
  assert.equal(model.doStreamCalls.length, 2);
  assert.equal(output.chunks.some((chunk) => chunk.type === "error"), false);
});

test("abort during reactive compaction prevents a new attempt", async () => {
  const fixture = syntheticTurn();
  const parent = new AbortController();
  const model = new MockLanguageModelV3({ doStream: { stream: convertArrayToReadableStream<LanguageModelV3StreamPart>([
    { type: "error", error: new Error("prompt is too long") },
  ]) } });
  await assert.rejects(runAgentStreamLoopCore({ ...fixture.runtime, ...writerFixture(), model, abortSignal: parent.signal }, {
    recordUsage: () => {},
    prepareContext: async ({ abortSignal }) => {
      assert.equal(abortSignal, parent.signal);
      parent.abort();
      return fixture.runtime.preparedContext;
    },
  }), { name: "AbortError" });
  assert.equal(model.doStreamCalls.length, 1);
});

test("writer failure aborts a stalled provider before releasing its SDK reader", { timeout: 5_000 }, async () => {
  const fixture = syntheticTurn();
  const failure = new Error("consumer writer failed");
  let providerSignal: AbortSignal | undefined;
  const model = new MockLanguageModelV3({ doStream: async ({ abortSignal }) => {
    providerSignal = abortSignal;
    return { stream: new ReadableStream<LanguageModelV3StreamPart>({ start(controller) {
      controller.enqueue({ type: "text-start", id: "text" });
      controller.enqueue({ type: "text-delta", id: "text", delta: "partial" });
      abortSignal!.addEventListener("abort", () => controller.close(), { once: true });
    } }) };
  } });
  const writer: UIMessageStreamWriter<AgentUIMessage> = {
    write(chunk) { if (chunk.type === "text-delta") throw failure; },
    merge() {}, onError: undefined,
  };
  await assert.rejects(runAgentStreamLoopCore({ ...fixture.runtime, model, writer }, {
    recordUsage: () => {}, prepareContext: async () => { throw new Error("must not retry"); },
  }), (error) => error === failure);
  assert.equal(providerSignal?.aborted, true);
  assert.equal(providerSignal?.reason, failure);
  assert.equal(model.doStreamCalls.length, 1);
});
