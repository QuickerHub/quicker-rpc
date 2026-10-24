import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createManualTraceManager, manualTraceManager } from "./action-trace-manual.server";
import { readManualTraceRequest } from "./action-trace-manual-contract";
import { traceBridge } from "./action-trace-bridge.server";
import { qkrpcRequestContext } from "./qkrpc-request-context";
import { GET, POST } from "../app/api/actions/trace/stream/route";
import { createAgentRuntimeLoader } from "./agent-service/production-runtime.server";
import { prepareOwnedActionTrace } from "./action-trace-stream.server";

const id = "11111111-1111-4111-8111-111111111111";
const binding = { hostInstanceId: "manual-fixture", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: {}, extension: { identity: "full" } };
let serial = 0;
const createId = () => `manual-fixture-${++serial}`;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
async function root() {
  const parent = fileURLToPath(new URL("../../.tmp/manual-trace-fixture/", import.meta.url)); await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, "run-"));
}
async function environment(run: () => Promise<void>) {
  const old = { fetch: globalThis.fetch, binding: process.env.QKRPC_HOST_BINDING, session: process.env.QKRPC_HOST_SESSION, transport: process.env.QKRPC_TRANSPORT };
  process.env.QKRPC_HOST_BINDING = JSON.stringify(binding); delete process.env.QKRPC_HOST_SESSION; delete process.env.QKRPC_TRANSPORT;
  try { await run(); } finally {
    globalThis.fetch = old.fetch;
    for (const [key, value] of [["QKRPC_HOST_BINDING", old.binding], ["QKRPC_HOST_SESSION", old.session], ["QKRPC_TRANSPORT", old.transport]] as const)
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
function controlledNative() {
  const requests: Array<{ body: Record<string, unknown>; signal: AbortSignal; controller: ReadableStreamDefaultController<Uint8Array> }> = [];
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/v1\/action\/trace\/stream$/);
    const signal = init!.signal!; const body = JSON.parse(String(init!.body));
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      requests.push({ body, signal, controller });
      signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
    } }));
  };
  return { requests, done(index: number, data: unknown = { ok: true, eventCount: 0 }) {
    requests[index].controller.enqueue(new TextEncoder().encode(`event: done\ndata: ${JSON.stringify(data)}\n\n`)); requests[index].controller.close();
  } };
}
test("manual contract snapshots inline native data and rejects spoofed/mixed targets", () => {
  const raw = { cwd: "fixture", actionId: "ephemeral:case", param: " p ", xaction: { title: "native", steps: [{ future: { file: "files/code.txt" } }], variables: [{ defaultValue: "files/ref" }] } };
  const parsed = readManualTraceRequest(raw); raw.xaction.steps[0].future.file = "changed";
  assert.equal((parsed.xaction!.steps[0] as { future: { file: string } }).future.file, "files/code.txt"); assert.equal(parsed.param, "p");
  assert.throws(() => readManualTraceRequest({ ...raw, actionId: id }), /Inline trace/);
  assert.throws(() => readManualTraceRequest({ cwd: "fixture", actionId: id, expectedProjectBinding: null }), /exact project directory/);
  assert.equal("runId" in readManualTraceRequest({ cwd: "fixture", actionId: id, runId: "spoofed" }), false);
});
test("manual runs own synthetic executions and exact pinned native requests; ACK detaches request, feed close does not cancel", async () => environment(async () => {
  const cwd = await root(); const manager = createManualTraceManager({ createId }); const native = controlledNative();
  const parent = { threadId: "Chat-parent", traceRuns: [], traceRefs: [] };
  const request = new AbortController();
  const a = await qkrpcRequestContext.run(parent, () => manager.start({ cwd, actionId: id, param: "same" }, request.signal));
  const b = await manager.start({ cwd, actionId: id, param: "same" }, new AbortController().signal);
  a.acknowledge(); b.acknowledge(); request.abort(new Error("normal request cleanup after ACK"));
  assert.equal(native.requests.length, 2); assert.notEqual(a.owner.runId, b.owner.runId); assert.notEqual(a.owner.threadId, b.owner.threadId);
  assert.match(a.owner.threadId, /^manual:/); assert.equal(a.owner.toolCallId, undefined); assert.deepEqual(a.owner.invocationPath, []);
  assert.deepEqual(native.requests[0].body.hostBinding, binding); assert.equal(native.requests[0].signal.aborted, false); assert.equal(parent.traceRuns.length, 0);
  const response = await GET(new Request(`http://fixture/api/actions/trace/stream?owner=${encodeURIComponent(JSON.stringify(a.owner))}`));
  await response.body!.cancel(); assert.equal(native.requests[0].signal.aborted, false);
  native.done(0); native.done(1); await manager.stop(); assert.equal(manager.size(), 0);
}));
test("pre-dispatch cancellation and target rejection perform zero native work and preserve the original reason", async () => environment(async () => {
  const cwd = await root(); let requests = 0; globalThis.fetch = async () => { requests++; throw Error("unexpected RPC"); };
  const manager = createManualTraceManager({ createId }); const abort = new AbortController(); const reason = Error("cancel before start"); abort.abort(reason);
  await assert.rejects(manager.start({ cwd, actionId: id }, abort.signal), (error) => error === reason);
  const gate = deferred<string>(); const preparing = createManualTraceManager({ createId, validateCwd: () => gate.promise }); const before = new AbortController();
  const pending = preparing.start({ cwd, actionId: id }, before.signal); const check = assert.rejects(pending, (error) => error === reason);
  before.abort(reason); gate.resolve(cwd); await check; await preparing.stop();
  assert.equal(requests, 0); assert.equal(manager.size(), 0); assert.equal(preparing.size(), 0);
  await manager.stop();
}));
test("known project unbound/mismatch/unsafe and a changed full binding all reject without native dispatch", async () => environment(async () => {
  const cwd = await root(); const directory = `.quicker/actions/${id}`; await mkdir(join(cwd, directory, ".qkrpc"), { recursive: true });
  await writeFile(join(cwd, directory, "info.json"), JSON.stringify({ id }));
  let dispatches = 0; globalThis.fetch = async () => { dispatches++; throw Error("Unexpected RPC"); };
  const manager = createManualTraceManager({ createId });
  await assert.rejects(manager.start({ cwd, actionId: id }, new AbortController().signal), /no verified host binding/);
  const record = { schemaVersion: 1 as const, kind: "action" as const, actionId: id, hostBinding: binding };
  await writeFile(join(cwd, directory, ".qkrpc/project-binding.json"), JSON.stringify(record));
  globalThis.fetch = async (url, init) => { dispatches++; assert.match(String(url), /\/v1\/action\/trace\/stream$/); assert.deepEqual(JSON.parse(String(init!.body)).hostBinding, binding); return new Response('event: done\ndata: {"ok":true}\n\n'); };
  const matching = await manager.start({ cwd, actionId: id, projectDirectory: directory, expectedProjectBinding: record }, new AbortController().signal); matching.acknowledge();
  assert.deepEqual(matching.owner.hostBinding, binding); assert.equal(dispatches, 1);
  await assert.rejects(manager.start({ cwd, actionId: id, projectDirectory: directory, expectedProjectBinding: { ...record, hostBinding: { ...binding, extension: { identity: "other" } } } }, new AbortController().signal), /differs from the current/);
  await assert.rejects(manager.start({ cwd, actionId: id, projectDirectory: "../outside" }, new AbortController().signal), (error: unknown) => (error as { code?: string }).code === "UNSAFE_PROJECT_PATH");
  await assert.rejects(manager.start({ cwd, actionId: id, projectDirectory: directory, expectedProjectBinding: null }, new AbortController().signal), /unbound project/);
  const changing = createManualTraceManager({ createId, prepare: async (...args) => {
    const prepared = await prepareOwnedActionTrace(...args);
    await writeFile(join(cwd, directory, ".qkrpc/project-binding.json"), JSON.stringify({ ...record, hostBinding: { ...binding, extension: { identity: "changed during prepare" } } }));
    return prepared;
  } });
  await assert.rejects(changing.start({ cwd, actionId: id, projectDirectory: directory, expectedProjectBinding: record }, new AbortController().signal), /changed while preparing/);
  await changing.stop();
  assert.equal(dispatches, 1); await manager.stop();
}));
test("bare action selects a unique verified host once; multiple hosts fail and inline payload remains unchanged", async () => environment(async () => {
  delete process.env.QKRPC_HOST_BINDING;
  const cwd = await root(); let discoveries = 0, dispatches = 0; let multiple = true; let inlineBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/v1/invoke")) { discoveries++; assert.equal(JSON.parse(String(init!.body)).op, "host.list"); return Response.json({ data: { candidates: multiple ? [binding, { ...binding, hostInstanceId: "other" }] : [binding] } }); }
    dispatches++; inlineBody = JSON.parse(String(init!.body)); return new Response('event: done\ndata: {"ok":true}\n\n');
  };
  const manager = createManualTraceManager({ createId });
  await assert.rejects(manager.start({ cwd, actionId: id }, new AbortController().signal), /Multiple compatible hosts/); assert.equal(dispatches, 0);
  multiple = false;
  const xaction = { title: "inline native", steps: [{ inputParams: { code: { file: "files/script.cs" }, explicitEmpty: { value: "" } } }], variables: [{ defaultValue: "file-reference-unchanged" }] };
  const accepted = await manager.start({ cwd, actionId: "ephemeral:case", xaction }, new AbortController().signal); accepted.acknowledge();
  assert.match(accepted.owner.actionId, /^ephemeral:manual-fixture-/); assert.deepEqual(inlineBody!.xaction, xaction); assert.deepEqual(inlineBody!.hostBinding, binding);
  await manager.stop(); assert.equal(discoveries, 2); assert.equal(dispatches, 1);
}));
test("ACK-window loss, service stop and timeout produce one unknown terminal with no late publication or retry", async () => environment(async () => {
  const cwd = await root(); const native = controlledNative(); const manager = createManualTraceManager({ createId }); const request = new AbortController();
  const accepted = await manager.start({ cwd, actionId: id }, request.signal);
  const events: Array<{ type: string; data?: Record<string, unknown> }> = []; traceBridge.subscribe(accepted.owner, (event) => events.push(event));
  request.abort(Error("ACK lost")); await manager.stop();
  assert.equal(native.requests.length, 1); assert.equal(events.filter((event) => event.type === "done").length, 1);
  assert.equal(events.at(-1)!.data!.error, "WRITE_RESULT_UNKNOWN"); assert.equal(traceBridge.event(accepted.owner, { message: "late native event" }), false);
  const nextNative = controlledNative(); const timed = createManualTraceManager({ createId, timeoutMs: 5,
    validateCwd: async () => cwd, validateTarget: async () => undefined });
  const timedAck = await timed.start({ cwd, actionId: id }, new AbortController().signal); timedAck.acknowledge();
  const terminal = deferred<void>(); traceBridge.subscribe(timedAck.owner, (event) => { if (event.type === "done") terminal.resolve(); });
  await terminal.promise; assert.equal(nextNative.requests[0].signal.aborted, true); await timed.stop();
  await assert.rejects(timed.start({ cwd, actionId: id }, new AbortController().signal), /stopped/);
  const closing = createManualTraceManager({ createId }); const closeNative = controlledNative(); const last = await closing.start({ cwd, actionId: id }, new AbortController().signal); last.acknowledge();
  const runtime = await createAgentRuntimeLoader(async () => ({ runTurn: () => new Response(), stopBrowserRuntimes() {}, stopTerminalRuntimes() {}, stopBackgroundTasks: closing.stop,
    closeDatabase() { assert.equal(closing.size(), 0); } }))();
  await Promise.all([runtime.dispose(), runtime.dispose()]); assert.equal(closeNative.requests[0].signal.aborted, true);
}));
test("actual manual route accepts one owned run, rejects bare GET history and validates errors without dispatch", async () => environment(async () => {
  const cwd = await root(); const native = controlledNative();
  try {
  const before = new AbortController(); before.abort(Error("pre-dispatch"));
  const preResponse = await POST(new Request("http://fixture/api/actions/trace/stream", { method: "POST", body: JSON.stringify({ cwd, actionId: id }), signal: before.signal }));
  assert.equal(preResponse.status, 499); assert.equal((await preResponse.json()).dispatchStatus, "not-dispatched"); assert.equal(native.requests.length, 0);
  const ackAbort = new AbortController(); const fakeFetch = globalThis.fetch;
  globalThis.fetch = (...args) => { const response = fakeFetch(...args); queueMicrotask(() => ackAbort.abort(Error("ACK window aborted"))); return response; };
  const lost = await POST(new Request("http://fixture/api/actions/trace/stream", { method: "POST", body: JSON.stringify({ cwd, actionId: id }), signal: ackAbort.signal }));
  const lostBody = await lost.json(); assert.equal(lost.status, 499); assert.equal(lostBody.code, "WRITE_RESULT_UNKNOWN"); assert.equal(lostBody.dispatchStatus, "possibly-dispatched"); assert.ok(lostBody.owner.runId);
  assert.equal(native.requests.length, 1); globalThis.fetch = fakeFetch;
  const response = await POST(new Request("http://fixture/api/actions/trace/stream", { method: "POST", body: JSON.stringify({ cwd, actionId: id, runId: "caller-spoof" }) }));
  assert.equal(response.status, 202); const result = await response.json(); assert.notEqual(result.owner.runId, "caller-spoof");
  assert.equal(native.requests.length, 2); native.done(1);
  assert.equal((await GET(new Request(`http://fixture/api/actions/trace/stream?id=${id}`))).status, 400);
  assert.equal((await POST(new Request("http://fixture/api/actions/trace/stream", { method: "POST", body: "{" }))).status, 400);
  assert.equal((await POST(new Request("http://fixture/api/actions/trace/stream", { method: "POST", body: JSON.stringify({ cwd: "relative", actionId: id }) }))).status, 400);
  assert.equal(native.requests.length, 2);
  } finally { await manualTraceManager.stop(); }
}));
test("stop publishes the same promise before synchronous abort listeners can reenter", async () => environment(async () => {
  const cwd = await root(); const native = controlledNative();
  let nested: Promise<void> | undefined;
  const manager = createManualTraceManager({ createId, prepare: async (...args) => {
    const prepared = await prepareOwnedActionTrace(...args);
    args[1]!.abortSignal!.addEventListener("abort", () => { nested = manager.stop(); }, { once: true });
    return prepared;
  } });
  const accepted = await manager.start({ cwd, actionId: id }, new AbortController().signal); accepted.acknowledge();
  const stopped = manager.stop(); assert.equal(nested, stopped); assert.equal(manager.stop(), stopped); await stopped;
  assert.equal(native.requests.length, 1); assert.equal(manager.size(), 0);
}));
test("noncooperative prepare/run has a bounded structured shutdown failure and remains owned until real settlement", async () => environment(async () => {
  const cwd = await root(); const gate = deferred<string>(); let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error("unexpected dispatch"); };
  const preparing = createManualTraceManager({ createId, validateCwd: () => gate.promise, stopTimeoutMs: 5 });
  const pending = preparing.start({ cwd, actionId: id }, new AbortController().signal);
  const pendingRejection = assert.rejects(pending, /stopped observing/);
  await assert.rejects(preparing.stop(), (error: unknown) => (error as { code?: string }).code === "TRACE_SHUTDOWN_TIMEOUT");
  assert.equal(preparing.size(), 1); gate.resolve(cwd); await pendingRejection; assert.equal(preparing.size(), 0); assert.equal(calls, 0);
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  globalThis.fetch = async () => { calls++; return new Response(new ReadableStream({ start(value) { controller = value; } })); };
  const running = createManualTraceManager({ createId, stopTimeoutMs: 5 }); const accepted = await running.start({ cwd, actionId: id }, new AbortController().signal); accepted.acknowledge();
  const events: Array<{ type: string; data?: Record<string, unknown> }> = []; traceBridge.subscribe(accepted.owner, (event) => events.push(event));
  await assert.rejects(running.stop(), (error: unknown) => (error as { code?: string }).code === "TRACE_SHUTDOWN_TIMEOUT"); assert.equal(running.size(), 1);
  assert.equal(events.filter((event) => event.type === "done").length, 1); assert.equal(events.at(-1)!.data!.error, "WRITE_RESULT_UNKNOWN");
  controller.enqueue(new TextEncoder().encode('event: trace\ndata: {"kind":"info","message":"late"}\n\nevent: done\ndata: {"ok":true}\n\n')); controller.close();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(running.size(), 0); assert.equal(events.filter((event) => event.type === "done").length, 1); assert.equal(events.some((event) => event.type === "trace"), false);
}));
