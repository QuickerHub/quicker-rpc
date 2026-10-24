import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readTraceRunOwner, sameTraceRunOwner, traceRunTabId, type TraceRunOwner, type TraceRunProgress } from "./action-trace-owner";
import { createTraceBridgeRegistry, traceBridge } from "./action-trace-bridge.server";
import { runActionTraceForAgentTool } from "./action-trace-stream.server";
import { bindQkrpcTarget } from "./qkrpc-host-binding";
import { qkrpcRequestContext, runWithAgentRequestContextAsync, runWithTraceTaskInvocation } from "./qkrpc-request-context";
import { attachActionTraceArtifactToDebugResult } from "./action-trace-artifact.server";
import { parseActionTraceArtifactDocument, readActionTraceRef } from "./action-trace-artifact";
import { formatToolResultForAgent } from "./tool-result-agent-view";
import { QKRPC_ACTION_DEBUG_TOOL } from "./qkrpc-action-tool";
import { GET } from "../app/api/actions/trace/feed/route";
import { QKRPC_ACTION_DEBUG_TOOL_DEF } from "./qkrpc-action-tool.server";
import { createAgentTurnRunner } from "./agent-harness/turn-runner";
import { syntheticTurn } from "./agent-harness/turn-test-fixtures";
import { runAgentStreamLoopCore } from "./agent-harness/stream-loop";
import { MockLanguageModelV3, convertArrayToReadableStream } from "ai/test";
import { readUIMessageStream, type UIMessageChunk } from "ai";
import type { AgentUIMessage } from "./chat-types";
import { createTraceEventDedupe } from "./action-trace-event-dedupe";

const binding = { hostInstanceId: "trace-fixture", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", protocolVersion: 1, schemaVersion: 1,
  hostKind: "v1", quickerVersion: "fixture", capabilities: {} };
function owner(runId: string, threadId = "thread-A"): TraceRunOwner {
  return readTraceRunOwner({ version: 1, runId, executionId: `execution-${threadId}`, threadId, cwd: "fixture-cwd",
    actionId: "same-action", param: "same-param", toolCallId: "call_0", invocationPath: [], hostBinding: binding })!;
}
test("owner snapshots full host identity and distinguishes adjacent runs/call_0", () => {
  const raw = { ...owner("one"), hostBinding: { ...binding, extension: { value: 1 } } };
  const first = readTraceRunOwner(raw)!; raw.hostBinding.extension.value = 2;
  assert.equal((first.hostBinding as unknown as { extension: { value: number } }).extension.value, 1);
  assert.equal(sameTraceRunOwner(first, readTraceRunOwner(raw)!), false);
  assert.notEqual(traceRunTabId(owner("one")), traceRunTabId(owner("two")));
  assert.equal(readTraceRunOwner({ ...raw, hostBinding: { ...binding, hostSessionId: "invalid" } }), undefined);
});
test("native duplicate cache bounds retained body bytes and never conflates distinct repeated sequences", () => {
  const dedupe = createTraceEventDedupe(256, 4);
  assert.equal(dedupe.accept({ sequence: 1, message: "A" }), true);
  assert.equal(dedupe.accept({ sequence: 1, message: "A" }), false);
  assert.equal(dedupe.accept({ sequence: 1, message: "B" }), true);
  assert.equal(dedupe.accept({ sequence: 2, message: "x".repeat(1_000_000) }), true);
  assert.ok(dedupe.retainedBytes() <= 256);
  for (let n = 0; n < 100; n += 1) { dedupe.accept({ sequence: n, message: "x".repeat(30) }); assert.ok(dedupe.retainedBytes() <= 256); assert.ok(dedupe.retainedEntries() <= 4); }
  dedupe.clear(); assert.equal(dedupe.retainedBytes(), 0); assert.equal(dedupe.retainedEntries(), 0);
});
test("bridge keeps same-action invocations separate, deduplicates native sequence, and terminal is exactly once", () => {
  let now = 0; const bridge = createTraceBridgeRegistry(() => now);
  const a = owner("a"), b = owner("b", "thread-B"); bridge.start(a); bridge.start(b);
  const events: unknown[] = []; const release = bridge.subscribe(a, (event) => events.push(event))!;
  assert.equal(bridge.event(a, { sequence: 1, message: "A" }), true);
  assert.equal(bridge.event(a, { sequence: 1, message: "A" }), false);
  assert.equal(bridge.event(a, { sequence: 1, message: "different native event with colliding sequence" }), true);
  bridge.event(b, { sequence: 1, message: "B" });
  assert.equal(bridge.finish(a, { ok: true }), true);
  assert.equal(bridge.finish(a, { ok: false }), false);
  assert.equal(bridge.event(a, { sequence: 2 }), false); release();
  assert.equal(events.length, 3);
  const replay: unknown[] = []; bridge.subscribe(b, (event) => replay.push(event))!();
  assert.equal(replay.length, 1); assert.match(JSON.stringify(replay), /B/);
  assert.equal(bridge.has({ ...a, cwd: "different" }), false);
  assert.equal(bridge.subscribe(owner("unknown"), () => {}), undefined);
  now = 300_001; assert.equal(bridge.has(a), false); assert.equal(bridge.has(b), true);
  bridge.finish(b, { ok: false }); now += 300_001; assert.equal(bridge.size(), 0);
});
test("bridge replay retention caps complete runs and buffers without retaining full terminal events", () => {
  const bridge = createTraceBridgeRegistry(() => 1);
  for (let n = 0; n < 70; n += 1) { const o = owner(`retained-${n}`); bridge.start(o); bridge.finish(o, { ok: true, events: [{ message: "large" }] }); }
  assert.equal(bridge.size(), 64);
  const o = owner("bounded"); bridge.start(o);
  for (let n = 0; n < 5000; n += 1) bridge.line(o, "x".repeat(1000));
  const replay: unknown[] = []; bridge.subscribe(o, (event) => replay.push(event))!();
  assert.ok(replay.length <= 2048); assert.ok(JSON.stringify(replay).length < 2_100_000);
  const huge = owner("huge-terminal"); bridge.start(huge);
  bridge.finish(huge, { ok: true, returnResult: "x".repeat(2_000_001) });
  const terminal: Array<{ type: string; data?: Record<string, unknown> }> = [];
  bridge.subscribe(huge, (event) => terminal.push(event))!();
  assert.equal(terminal.length, 1); assert.equal(terminal[0].type, "done");
  assert.equal(terminal[0].data?.outputTruncated, true); assert.ok(JSON.stringify(terminal).length < 100_000);
});
test("dedicated fake SSE per request preserves host/run/thread, task path and artifact/history through compression", async () => {
  const parent = fileURLToPath(new URL("../../.tmp/trace-owned/", import.meta.url)); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "run-"));
  const oldFetch = globalThis.fetch;
  const requests: Array<{ signal: AbortSignal; body: unknown }> = [];
  const emitted: TraceRunProgress[] = [];
  let sequence = 0;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)); requests.push({ signal: init!.signal!, body });
    assert.deepEqual(body.hostBinding, binding);
    return new Response(`event: trace\ndata: {"sequence":1,"kind":"info","message":"${requests.length}"}\n\nevent: trace\ndata: {"sequence":1,"kind":"info","message":"${requests.length}"}\n\nevent: done\ndata: {"ok":true,"events":[{"sequence":1,"kind":"info","message":"saved"}],"eventCount":1}\n\n`);
  };
  try {
    const run = (threadId: string) => runWithAgentRequestContextAsync({ cwd: root, threadId,
      traceExecution: { executionId: `exec-${threadId}`, createRunId: () => `unique-${++sequence}`, emit: (event) => emitted.push(event) } }, async () => {
      bindQkrpcTarget({ gateway: "http://trace-fixture.invalid", binding: readTraceRunOwner({ ...owner("x"), hostBinding: binding })!.hostBinding });
      return runWithTraceTaskInvocation("call_0", "child", async () => {
        const trace = await runActionTraceForAgentTool({ id: "same-action", param: "same-param" }, { toolCallId: "call_0" });
        const result = await attachActionTraceArtifactToDebugResult({ ok: trace.ok, exitCode: trace.exitCode, source: "qkrpc", data: trace.parsed }, { actionId: "same-action", param: "same-param" });
        return formatToolResultForAgent(QKRPC_ACTION_DEBUG_TOOL, { id: "same-action" }, result);
      });
    });
    const [a, b] = await Promise.all([run("thread-A"), run("thread-B")]);
    assert.equal(requests.length, 2); assert.notEqual(requests[0].signal, requests[1].signal);
    for (const scoped of [a, b]) {
      assert.equal(scoped.traceRuns.length, 1);
      assert.equal(scoped.traceRefs.length, 1);
      const data = scoped.value.data as Record<string, unknown>;
      const ref = readActionTraceRef(data.traceRef)!; const o = readTraceRunOwner(data.traceOwner)!;
      assert.ok(sameTraceRunOwner(o, scoped.traceRuns[0])); assert.ok(sameTraceRunOwner(ref.owner!, o));
      assert.equal(scoped.traceRefs[0].path, ref.path);
      const artifact = parseActionTraceArtifactDocument(await readFile(join(root, ref.path), "utf8"))!;
      assert.ok(sameTraceRunOwner(artifact.traceOwner!, o));
      assert.equal(o.invocationPath[0].toolCallId, "call_0"); assert.equal(o.toolCallId, "call_0");
      const persisted = JSON.parse(JSON.stringify(scoped.value));
      assert.ok(persisted.data.traceOwner); assert.ok(persisted.displayData.traceOwner);
    }
    assert.notEqual(a.traceRuns[0].runId, b.traceRuns[0].runId);
    assert.notEqual(a.traceRuns[0].invocationPath[0].invocationId, b.traceRuns[0].invocationPath[0].invocationId);
    assert.equal(emitted.filter((e) => e.kind === "start").length, 2);
    assert.equal(emitted.filter((e) => e.kind === "terminal").length, 2);
    assert.equal(emitted.filter((e) => e.kind === "result").length, 2);
    assert.equal(JSON.stringify(emitted.filter((e) => e.kind !== "start")).includes('"events"'), false);
  } finally { globalThis.fetch = oldFetch; }
});
test("missing native done, observer close and turn cancellation all finish once without re-execution", async () => {
  const oldFetch = globalThis.fetch; let requests = 0; let n = 0;
  const emitted: TraceRunProgress[] = [];
  try {
    globalThis.fetch = async () => { requests += 1; return new Response(""); };
    const run = (signal?: AbortSignal) => runWithAgentRequestContextAsync({ cwd: "fixture-cwd", threadId: "terminal-thread", abortSignal: signal,
      traceExecution: { executionId: "terminal-exec", createRunId: () => `terminal-${++n}`, emit: (e) => emitted.push(e) } }, async () => {
      bindQkrpcTarget({ gateway: "http://trace-fixture.invalid", binding: owner("binding").hostBinding });
      return runActionTraceForAgentTool({ id: "same-action" });
    });
    assert.equal((await run()).ok, false);
    const first = emitted[0].owner;
    const response = await GET(new Request(`http://fixture/api/actions/trace/feed?owner=${encodeURIComponent(JSON.stringify(first))}`));
    assert.match(await response.text(), /WRITE_RESULT_UNKNOWN/);
    const abort = new AbortController(); const reason = new Error("owned cancellation");
    globalThis.fetch = async (_url, init) => { requests += 1; return new Response(new ReadableStream({ start(controller) {
      init!.signal!.addEventListener("abort", () => controller.error(init!.signal!.reason)); queueMicrotask(() => abort.abort(reason));
    } })); };
    await assert.rejects(run(abort.signal), (error) => error === reason);
    assert.equal(emitted.filter((e) => e.kind === "terminal").length, 2);
    assert.equal(requests, 2);
    assert.equal(qkrpcRequestContext.getStore(), undefined);
    const spoofed = { ...first, cwd: "another" };
    assert.equal((await GET(new Request(`http://fixture/?owner=${encodeURIComponent(JSON.stringify(spoofed))}`))).status, 404);
    assert.equal(traceBridge.event(first, { sequence: 99 }), false);
  } finally { globalThis.fetch = oldFetch; }
});

test("injected composition factory survives the actual SDK loop, request writer and UI history reader", async () => {
  const parent = fileURLToPath(new URL("../../.tmp/trace-owned/", import.meta.url)); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "sdk-")); const fixture = syntheticTurn();
  const oldFetch = globalThis.fetch; let requests = 0, calls = 0, runIds = 0;
  const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
  const model = new MockLanguageModelV3({ doStream: async () => ({ stream: convertArrayToReadableStream(calls++ === 0 ? [
    { type: "tool-call" as const, toolCallId: "call_0", toolName: QKRPC_ACTION_DEBUG_TOOL, input: '{"id":"same-action","param":"same-param"}' },
    { type: "finish" as const, finishReason: { unified: "tool-calls" as const, raw: "tool-calls" }, usage },
  ] : [
    { type: "text-start" as const, id: "answer" }, { type: "text-delta" as const, id: "answer", delta: "trace complete" }, { type: "text-end" as const, id: "answer" },
    { type: "finish" as const, finishReason: { unified: "stop" as const, raw: "stop" }, usage },
  ]) }) });
  globalThis.fetch = async (_url, init) => {
    requests += 1; assert.deepEqual(JSON.parse(String(init?.body)).hostBinding, binding);
    return new Response('event: trace\ndata: {"sequence":1,"kind":"info","message":"actual SDK trace"}\n\nevent: done\ndata: {"ok":true,"eventCount":1,"events":[{"sequence":1,"kind":"info","message":"actual SDK trace"}]}\n\n');
  };
  const run = createAgentTurnRunner({
    createExecutionId: () => "injected-execution", createTraceRunId: () => `injected-run-${++runIds}`,
    resolveRequest: async () => ({ ...fixture.request, cwd: root, benchMode: false }), tryDirectResponse: async () => null,
    resolveModel: async () => ({ model, modelId: "fixture" }),
    resolveScope: async (_request, _signal, executionState) => ({ ...fixture.scope,
      toolExecutionContext: { ...fixture.scope.toolExecutionContext, executionState, cwd: root, benchMode: false } }),
    prepareRuntime: async () => {
      bindQkrpcTarget({ gateway: "http://trace-fixture.invalid", binding: owner("unused").hostBinding });
      return { ...fixture.runtime, model, tools: { [QKRPC_ACTION_DEBUG_TOOL]: QKRPC_ACTION_DEBUG_TOOL_DEF } };
    },
    withContext: runWithAgentRequestContextAsync,
    runLoop: (params) => runAgentStreamLoopCore(params, { recordUsage() {}, prepareContext: async () => { throw new Error("No retry"); } }),
  });
  try {
    const response = await run(fixture.request.body);
    const text = await response.text();
    const chunks = text.split("\n").filter((line) => line.startsWith("data: ") && line !== "data: [DONE]").map((line) => JSON.parse(line.slice(6)) as UIMessageChunk);
    let final: AgentUIMessage | undefined;
    for await (const message of readUIMessageStream<AgentUIMessage>({ stream: convertArrayToReadableStream(chunks), terminateOnError: true })) final = message;
    assert.ok(final); assert.equal(final.metadata?.executionId, "injected-execution");
    const progress = final.parts.filter((part) => part.type === "data-actionTrace").map((part) => part.data);
    assert.deepEqual(progress.map((event) => event.kind), ["start", "terminal", "result"]);
    assert.ok(progress.every((event) => event.owner.runId === "injected-run-1" && event.owner.toolCallId === "call_0" && event.owner.cwd === root));
    assert.equal(JSON.parse(JSON.stringify(final)).parts.filter((part: { type: string }) => part.type === "data-actionTrace").length, 3);
    assert.equal(calls, 2); assert.equal(requests, 1); assert.equal(runIds, 1);
    assert.equal(qkrpcRequestContext.getStore(), undefined);
  } finally { globalThis.fetch = oldFetch; }
});

test("observer disconnect never cancels execution and unknown/pre-dispatch owners never create sessions", async () => {
  const o = owner("observer-only"); traceBridge.start(o);
  const response = await GET(new Request(`http://fixture/?owner=${encodeURIComponent(JSON.stringify(o))}`));
  await response.body!.cancel();
  assert.equal(traceBridge.event(o, { sequence: 1, kind: "info" }), true);
  assert.equal(traceBridge.finish(o, { ok: true }), true);
  const emitted: TraceRunProgress[] = [];
  const before = traceBridge.size();
  await runWithAgentRequestContextAsync({ cwd: "fixture-cwd", threadId: "pre-dispatch",
    traceExecution: { executionId: "pre-dispatch", createRunId: () => "never-created", emit: (event) => emitted.push(event) } }, async () => {
    bindQkrpcTarget({ gateway: "cli", binding: o.hostBinding });
    const sdkAbort = new AbortController(); const sdkReason = new Error("SDK invocation stopped"); sdkAbort.abort(sdkReason);
    await assert.rejects(runActionTraceForAgentTool({ id: "same-action" }, { abortSignal: sdkAbort.signal }), (error) => error === sdkReason);
    assert.equal((await runActionTraceForAgentTool({ id: "same-action" })).ok, false);
  });
  assert.deepEqual(emitted, []); assert.equal(traceBridge.size(), before);
  assert.equal((await runActionTraceForAgentTool({ id: "same-action" })).ok, false);
});

test("production direct execute owns its synthetic execution, cwd, artifact and cleanup without borrowing Chat progress", async () => {
  const parent = fileURLToPath(new URL("../../.tmp/trace-owned/", import.meta.url)); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "direct-"));
  const roots = [join(root, "A"), join(root, "B")]; for (const directory of roots) await mkdir(directory);
  const keys = ["AGENT_GUI_ROOT", "QUICKER_AGENT_DATA_DIR", "APPDATA", "LOCALAPPDATA"];
  const previous = keys.map((key) => process.env[key]); for (const key of keys) process.env[key] = root;
  const oldFetch = globalThis.fetch; let requests = 0, progress = 0;
  const states: Array<{ closed: boolean }> = [];
  globalThis.fetch = async () => {
    requests += 1; states.push(qkrpcRequestContext.getStore()!.executionState!);
    return new Response('event: done\ndata: {"ok":true,"eventCount":1,"events":[{"sequence":1,"kind":"info","message":"direct"}]}\n\n');
  };
  try {
    const { executeQuickerToolDirect } = await import("./tool-execute.server");
    await runWithAgentRequestContextAsync({ cwd: root, threadId: "parent-chat", traceExecution: { executionId: "parent-execution", createRunId: () => "never-borrow", emit: () => { progress += 1; } } }, async () => {
      bindQkrpcTarget({ gateway: "http://trace-fixture.invalid", binding: owner("binding").hostBinding });
      const parentState = qkrpcRequestContext.getStore()!.executionState!;
      const outputs = await Promise.all(roots.map((workingDirectory) => executeQuickerToolDirect({ toolName: QKRPC_ACTION_DEBUG_TOOL,
        workingDirectory, approved: true, toolCallId: "call_0", input: { id: "same-action", traceOwner: { threadId: "forged" } } })));
      const owners = outputs.map((output, index) => {
        assert.equal("ok" in output && output.ok, true);
        const data = (output as { output: { data: Record<string, unknown> } }).output.data;
        const o = readTraceRunOwner(data.traceOwner)!; assert.ok(o); assert.equal(o.cwd, roots[index]); assert.match(o.threadId, /^direct:/);
        assert.notEqual(o.executionId, "parent-execution"); assert.equal(o.toolCallId, "call_0");
        assert.ok(readActionTraceRef(data.traceRef)?.owner); return o;
      });
      assert.notEqual(owners[0].runId, owners[1].runId); assert.notEqual(owners[0].threadId, owners[1].threadId);
      assert.equal(progress, 0); assert.equal(parentState.closed, false);
      assert.ok(states.every((state) => state.closed && state !== parentState));
      const abort = new AbortController(); abort.abort(new Error("direct cancelled"));
      const result = await executeQuickerToolDirect({ toolName: QKRPC_ACTION_DEBUG_TOOL, workingDirectory: roots[0], approved: true,
        input: { id: "same-action" }, abortSignal: abort.signal });
      assert.equal("ok" in result && result.ok, false); assert.equal(requests, 2);
    });
  } finally {
    globalThis.fetch = oldFetch;
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});
