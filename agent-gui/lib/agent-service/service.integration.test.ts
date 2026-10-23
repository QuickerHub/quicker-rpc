import assert from "node:assert/strict";
import { test } from "node:test";
import { convertToModelMessages, DefaultChatTransport, readUIMessageStream, tool, type UIMessage } from "ai";
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";
import { z } from "zod";
import { createAgentTurnRunner } from "../agent-harness/turn-runner";
import { runAgentStreamLoopCore } from "../agent-harness/stream-loop";
import { syntheticTurn } from "../agent-harness/turn-test-fixtures";
import { runWithAgentRequestContextAsync } from "../qkrpc-request-context";
import { startAgentService } from "./start-service";
import { AgentNodeHttpStopTimeoutError } from "./node-http";

const usage = {
  inputTokens: { total: 5, noCache: 5, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const finish = (reason = "stop") => ({ type: "finish" as const, finishReason: { unified: reason, raw: reason }, usage });

function fixture(approval: boolean) {
  const data = syntheticTurn();
  let toolCalls = 0, disposedTurns = 0, usageCalls = 0, modelCalls = 0;
  const tools = { echo: tool({
    inputSchema: z.object({ text: z.string() }), needsApproval: approval,
    execute: async ({ text }) => { toolCalls++; return { echoed: text }; },
  }) };
  const model = new MockLanguageModelV3({ doStream: async () => {
    const parts = modelCalls++ === 0 ? [
      { type: "tool-call", toolCallId: "offline-call", toolName: "echo", input: '{"text":"offline"}' }, finish("tool-calls"),
    ] : [
      { type: "text-start", id: "text" }, { type: "text-delta", id: "text", delta: "headless SDK answer" }, { type: "text-end", id: "text" }, finish(),
    ];
    return { stream: convertArrayToReadableStream(parts) };
  } });
  const runTurn = createAgentTurnRunner({
    resolveRequest: async (body) => ({ ...data.request, body, repairedMessages: body.messages, messagesForModel: body.messages }),
    tryDirectResponse: async () => null,
    resolveModel: async () => ({ model, modelId: "offline-fixture" }),
    resolveScope: async (_request, _signal, executionState) => ({
      ...data.scope, toolExecutionContext: { ...data.scope.toolExecutionContext, executionState },
    }),
    prepareRuntime: async ({ request }) => ({
      ...data.runtime, model, tools,
      preparedContext: { ...data.runtime.preparedContext, modelMessages: await convertToModelMessages(request.messagesForModel, { tools }) },
      dispose: async () => { disposedTurns++; },
    }),
    runLoop: (params) => runAgentStreamLoopCore(params, {
      recordUsage: () => { usageCalls++; },
      prepareContext: async () => { throw Error("unexpected fixture compression"); },
    }),
    withContext: runWithAgentRequestContextAsync,
  });
  return { runTurn, messages: data.request.repairedMessages, stats: () => ({ toolCalls, disposedTurns, usageCalls, modelCalls }) };
}

async function send(transport: DefaultChatTransport<UIMessage>, messages: UIMessage[]) {
  const stream = await transport.sendMessages({ trigger: "submit-message", chatId: "offline-chat", messages, abortSignal: undefined });
  let message: UIMessage | undefined;
  const previous = messages.at(-1);
  for await (const current of readUIMessageStream({ stream, message: previous?.role === "assistant" ? previous : undefined, terminateOnError: true })) message = current;
  assert.ok(message);
  return message;
}

test("Node service runs the existing runner and real SDK tool loop through the standard client transport", { timeout: 10_000 }, async () => {
  const data = fixture(false);
  let loads = 0, disposedRuntime = 0;
  const service = await startAgentService({ loadRuntime: async () => { loads++; return { runTurn: data.runTurn, dispose: () => { disposedRuntime++; } }; } });
  try {
    assert.equal((await (await fetch(service.origin + "/health")).json()).runtime, "lazy");
    assert.equal(loads, 0);
    const transport = new DefaultChatTransport({ api: service.origin + "/api/chat" });
    const response = await send(transport, data.messages);
    assert.ok(response.parts.some((part) => part.type === "text" && part.text === "headless SDK answer"));
    assert.ok(response.parts.some((part) => part.type === "tool-echo" && part.state === "output-available"));
    assert.deepEqual(data.stats(), { toolCalls: 1, disposedTurns: 1, usageCalls: 1, modelCalls: 2 });
  } finally { await service.stop(); }
  assert.equal(disposedRuntime, 1);
});

test("approval can cross HTTP and resume the same SDK tool call without a Next runtime", { timeout: 10_000 }, async () => {
  const data = fixture(true);
  const service = await startAgentService({ loadRuntime: () => ({ runTurn: data.runTurn, dispose() {} }) });
  try {
    const transport = new DefaultChatTransport({ api: service.origin + "/api/chat" });
    const pending = await send(transport, data.messages);
    const approval = pending.parts.find((part) => part.type === "tool-echo");
    assert.equal(approval?.state, "approval-requested");
    assert.equal(data.stats().toolCalls, 0);
    const approved = {
      ...pending,
      parts: pending.parts.map((part) => part === approval ? { ...part, state: "approval-responded", approval: { ...part.approval, approved: true } } : part),
    } as UIMessage;
    const response = await send(transport, [...data.messages, approved]);
    assert.ok(response.parts.some((part) => part.type === "text" && part.text === "headless SDK answer"));
    assert.equal(data.stats().toolCalls, 1);
    assert.equal(data.stats().disposedTurns, 2);
  } finally { await service.stop(); }
});

test("stop is reentrant and defers runtime disposal until a late request settles", { timeout: 10_000 }, async () => {
  let entered!: () => void, release!: (response: Response) => void, cleaned!: () => void;
  const ready = new Promise<void>((done) => { entered = done; });
  const pending = new Promise<Response>((done) => { release = done; });
  const disposed = new Promise<void>((done) => { cleaned = done; });
  let closes = 0;
  let nestedStop: Promise<void> | undefined;
  const service = await startAgentService({ stopGraceMs: 25, loadRuntime: () => ({
    runTurn: (_body, { abortSignal }) => {
      abortSignal.addEventListener("abort", () => { nestedStop = service.stop(); }, { once: true });
      entered();
      return pending;
    },
    dispose: () => { closes++; cleaned(); },
  }) });
  const request = fetch(service.origin + "/api/chat", { method: "POST", body: JSON.stringify({ messages: [] }) }).catch(() => undefined);
  await ready;
  const stopping = service.stop();
  assert.equal(nestedStop, stopping);
  await assert.rejects(stopping, AgentNodeHttpStopTimeoutError);
  assert.equal(service.stop(), stopping);
  assert.equal(closes, 0);
  release(Response.json({ ok: true }));
  await disposed;
  await request;
  assert.equal(closes, 1);
});
