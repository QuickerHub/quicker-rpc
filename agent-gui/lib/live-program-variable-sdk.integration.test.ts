import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Chat } from "@ai-sdk/react";
import { createAgentChatTransport, type AgentChatTransportRefs } from "./agent-chat-transport";
import { lastAssistantMessageIsCompleteWithClientResponses } from "./chat-auto-submit";
import { createLiveProgramDocumentTurn } from "./live-program-document-turn";
import { createLiveProgramDocumentTool } from "./live-program-document-tool";
import { createLiveProgramDocumentRegistry } from "./live-program-document-registry";
import { createProgramDocumentSession } from "./action-editor/document/programDocumentSession";
import { createProgramDocumentEditorController } from "./action-editor/program/programDocumentEditorController";
import { createProgramDocumentLiveEndpoint } from "./action-editor/program/liveProgramDocumentEndpoint";
import { createProgramVariableTag, formatProgramVariableTagMarkup } from "./program-variable-tag";
import { workspaceDocumentKey } from "./workspace-document-instances";
import type { AgentUIMessage } from "./chat-types";
import type { StructuredToolResult } from "./tool-result";
import type { LiveProgramDocumentCommand, LiveProgramDocumentEndpoint, LiveProgramDocumentRegistry, LiveProgramDocumentReceipt, LiveProgramDocumentScope } from "./live-program-document";

const cwd = "C:/variable-sdk-fixture", threadId = "variable-sdk-chat";
const selector = { surface: "main", variableId: "selected-variable" };
const content = '{"steps":[],"variables":[{"id":"selected-variable","key":"selected","varType":0,"defaultValue":"unchanged inline","desc":"original","group":"original group","saveState":false,"isLocked":false,"isInput":false,"isOutput":false,"unknown":{"integer":9223372036854775807,"decimal":0.1234567890123456789012345}},{"id":"unselected-variable","key":"unselected","varType":0,"desc":"leave alone","defaultValueFile":"files/unchanged.txt"}],"subPrograms":[],"unknownRoot":1e999}';

type ReadReceipt = Extract<LiveProgramDocumentReceipt, { ok: true; action: "read_live" }>;
type WireBody = Record<string, unknown> & { messages: AgentUIMessage[]; liveProgramDocument: { state: "ready"; scope: LiveProgramDocumentScope } };
type WireChunk = Record<string, unknown>;
const toolChunks = (id: string, input: unknown): WireChunk[] => [
  { type: "start", messageId: "variable-sdk-assistant" }, { type: "start-step" },
  { type: "tool-input-available", toolCallId: id, toolName: "workspace_program", input },
  { type: "finish-step" }, { type: "finish", finishReason: "tool-calls" },
];
const finalChunks: WireChunk[] = [
  { type: "start", messageId: "variable-sdk-assistant" }, { type: "start-step" }, { type: "text-start", id: "variable-final" },
  { type: "text-delta", id: "variable-final", delta: "Updated the selected variable in the original document. It remains unsaved." },
  { type: "text-end", id: "variable-final" }, { type: "finish-step" }, { type: "finish", finishReason: "stop" },
];

/** Canned model output enters the actual AI SDK transport/client-tool continuation.
 * The boundary rejects every endpoint except the in-memory /api/chat response. */
function stream(chunks: WireChunk[], signal?: AbortSignal | null, holdOpen = false) {
  const encoder = new TextEncoder(); let removeAbort = () => {};
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    const abort = () => { removeAbort(); controller.error(new DOMException("Fixture fetch aborted", "AbortError")); };
    for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
    if (holdOpen) { signal?.addEventListener("abort", abort, { once: true }); removeAbort = () => signal?.removeEventListener("abort", abort); }
    else { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); }
  }, cancel() { removeAbort(); } }), { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
}

function documentFixture() {
  const identity = { documentKey: "variable-sdk-original", projectBinding: null };
  const owner = { key: workspaceDocumentKey(cwd, "file:variables"), instanceId: 1, cwd, tabId: "file:variables", path: ".quicker/actions/variables/data.json" };
  const session = createProgramDocumentSession({ content, identity });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange() {} });
  let pendingHumanDraft = true, flushes = 0, mutations = 0;
  const actualEndpoint = createProgramDocumentLiveEndpoint({ owner, sessionId: "variable-sdk-original-session", session, controller,
    isCurrent: () => true, flushPendingEdits() {
      if (!pendingHumanDraft) return;
      const present = controller.getSurface("main").getPresent(); present.variables[0]!.desc = "human variable without blur";
      controller.getSurface("main").commit(present); pendingHumanDraft = false; flushes++;
    } });
  const endpoint: LiveProgramDocumentEndpoint = { ...actualEndpoint, setVariable(input) {
    mutations++; return actualEndpoint.setVariable!(input);
  } };
  const otherOwner = { ...owner, key: workspaceDocumentKey(cwd, "file:other"), tabId: "file:other", instanceId: 2, path: ".quicker/actions/other/data.json" };
  const otherSession = createProgramDocumentSession({ content, identity: { ...identity, documentKey: "variable-sdk-other" } });
  const otherController = createProgramDocumentEditorController(otherSession, { isCurrent: () => true, onChange() {} });
  const otherEndpoint = createProgramDocumentLiveEndpoint({ owner: otherOwner, sessionId: "variable-sdk-other-session", session: otherSession,
    controller: otherController, isCurrent: () => true, flushPendingEdits() {} });
  let sequence = 0;
  const original = createLiveProgramDocumentRegistry({ isOwnerCurrent: candidate => candidate === owner || candidate === otherOwner, createId: () => `variable-sdk-private-${++sequence}` });
  original.register(owner, endpoint); original.register(otherOwner, otherEndpoint);
  const captures: Parameters<LiveProgramDocumentRegistry["captureForManualSend"]>[0][] = [];
  const executions: { scope: LiveProgramDocumentScope; command: LiveProgramDocumentCommand }[] = [];
  const registry: LiveProgramDocumentRegistry = { ...original,
    captureForManualSend(input) { captures.push(structuredClone(input)); return original.captureForManualSend(input); },
    execute(scope, command, options) { executions.push(structuredClone({ scope, command })); return original.execute(scope, command, options); },
    executeAsync(scope, command, options) { executions.push(structuredClone({ scope, command })); return original.executeAsync(scope, command, options); },
  };
  const tag = createProgramVariableTag({ tagId: "variable-sdk-chip", chipTitle: "selected", programTarget: "action",
    programId: "11111111-1111-4111-8111-111111111111", documentPath: owner.path, ...selector,
    content: '{"id":"selected-variable","key":"selected","desc":"old chip snapshot"}' });
  return { owner, target: { owner, sessionId: "variable-sdk-original-session", identity }, session, controller, otherSession, registry, captures, executions, tag,
    flushes: () => flushes, mutationCalls: () => mutations };
}

function harness(t: TestContext, response: (body: WireBody, index: number, signal?: AbortSignal | null) => Response, options: {
  mode?: "agent" | "ask"; messages?: AgentUIMessage[];
  afterTool?: (id: string, output: StructuredToolResult, current: { stop(): Promise<void> }) => void;
} = {}) {
  const document = documentFixture(); let registry = document.registry;
  const turn = createLiveProgramDocumentTurn({ threadId, getRegistry: () => registry });
  const refs: AgentChatTransportRefs = { threadId, chatMode: { current: options.mode ?? "agent" }, enabledTools: { current: ["workspace_program", "docs"] },
    llmSelection: { current: "fixed-in-memory-variable-model" }, workingDirectory: { current: cwd }, titleManual: { current: false },
    designerEmbedScoped: { current: false }, actionDesigner: { current: undefined }, liveProgramDocumentTurn: turn.getBody };
  const requests: WireBody[] = [], outputs: Promise<void>[] = [], errors: Error[] = [], callbacks: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, "/api/chat", "No actual model, native host, file, save, sync or catalog endpoint is permitted");
    const body = JSON.parse(String(init?.body)) as WireBody; requests.push(body);
    assert.ok(requests.length <= 5, "the one SDK continuation chain must terminate");
    return response(body, requests.length - 1, init?.signal);
  });
  let chat: Chat<AgentUIMessage>;
  const stop = async () => { turn.stop(); await chat.stop(); };
  chat = new Chat<AgentUIMessage>({ id: threadId, messages: options.messages, transport: createAgentChatTransport(refs),
    sendAutomaticallyWhen: input => !(turn.getBody() && turn.isStopped()) && lastAssistantMessageIsCompleteWithClientResponses(input),
    onError: error => { errors.push(error); },
    onToolCall: async ({ toolCall }) => {
      if (toolCall.toolName !== "workspace_program" || !turn.getBody() || turn.isStopped()) return;
      callbacks.push(toolCall.toolCallId);
      const generation = turn.getGeneration(), output = await turn.executeAsync(toolCall.toolCallId, toolCall.input);
      options.afterTool?.(toolCall.toolCallId, output, { stop });
      if (turn.getGeneration() !== generation || turn.isStopped()) return;
      outputs.push(Promise.resolve(chat.addToolOutput({ tool: "workspace_program", toolCallId: toolCall.toolCallId, output })));
    },
  });
  t.after(async () => { turn.dispose(); document.registry.dispose(); await chat.stop(); });
  const text = `Update this selected live variable ${formatProgramVariableTagMarkup(document.tag)}`;
  const sendManual = (userMessageId: string) => {
    const pin = document.registry.pinVariable(document.owner, document.tag.tagId, selector, threadId);
    assert.equal("ok" in pin, false, JSON.stringify(pin)); turn.rememberPin(document.tag.tagId, pin);
    turn.begin({ userMessageId, text, cwd: refs.workingDirectory.current!, chatMode: refs.chatMode.current, enabledTools: refs.enabledTools.current });
    return chat.sendMessage({ id: userMessageId, role: "user", parts: [{ type: "text", text }] });
  };
  return { ...document, chat, turn, refs, requests, outputs, errors, callbacks, stop, sendManual, text,
    replaceRegistry(next: LiveProgramDocumentRegistry) { registry = next; } };
}

function readOutput(body: WireBody, id: string): ReadReceipt {
  const part = body.messages.flatMap(message => message.parts).find(part => "toolCallId" in part && part.toolCallId === id) as { output: StructuredToolResult } | undefined;
  assert.ok(part); const receipt = part.output.data as ReadReceipt; assert.ok(receipt.ok && receipt.variable); return receipt;
}
function editInput(scopeId: string, proof: ReadReceipt) {
  return { scopeId, action: "edit_variable_live", readOperationId: proof.operationId, expectedRevision: proof.revision, ...selector,
    contractRevision: proof.variable!.contract.revision, changes: [{ field: "desc", valueJson: '"SDK Agent description"' },
      { field: "group", valueJson: '"SDK Agent group"' }, { field: "saveState", valueJson: "true" }] };
}

test("the actual SDK variable read/addToolOutput/edit continuation retains the original manual scope and one undo", { timeout: 10_000 }, async t => {
  const f = harness(t, (body, index) => {
    const scopeId = body.liveProgramDocument.scope.scopeId;
    if (index === 0) return stream(toolChunks("variable-sdk-read", { scopeId, action: "read_live", variableFor: selector }));
    if (index === 1) {
      const proof = readOutput(body, "variable-sdk-read");
      assert.match(proof.variable!.variableJson, /human variable without blur/);
      assert.match(proof.variable!.variableJson, /9223372036854775807/);
      assert.equal(proof.variable!.contract.nativeValidation, "unobserved");
      return stream(toolChunks("variable-sdk-edit", editInput(scopeId, proof)));
    }
    assert.equal(index, 2); return stream(finalChunks);
  }, { afterTool(id) {
    if (id !== "variable-sdk-read") return;
    f.refs.workingDirectory.current = "C:/different-presented-file"; f.refs.chatMode.current = "ask"; f.refs.enabledTools.current = [];
    f.replaceRegistry({ ...f.registry, execute() { assert.fail("a later registry must not receive the captured manual turn"); } });
  } });
  await f.sendManual("actual-variable-manual-user"); await Promise.all(f.outputs);
  assert.deepEqual(f.errors, []); assert.equal(f.chat.status, "ready"); assert.equal(f.requests.length, 3);
  assert.equal(f.captures.length, 1); assert.equal(f.captures[0]!.userMessageId, "actual-variable-manual-user");
  for (const request of f.requests) {
    assert.equal(request.liveProgramDocument.scope.scopeId, f.requests[0]!.liveProgramDocument.scope.scopeId);
    assert.equal(request.liveProgramDocument.scope.userMessageId, "actual-variable-manual-user");
    assert.equal(request.liveProgramDocument.scope.target.sessionId, f.target.sessionId);
    assert.equal(request.workingDirectory, cwd); assert.equal(request.chatMode, "agent"); assert.deepEqual(request.enabledTools, ["workspace_program", "docs"]);
  }
  assert.deepEqual(f.callbacks, ["variable-sdk-read", "variable-sdk-edit"]);
  assert.deepEqual(f.executions.map(({ command }) => command.operationId), f.callbacks);
  const variable = f.controller.getSurface("main").getPresent().variables[0]!;
  assert.equal(variable.desc, "SDK Agent description"); assert.equal(variable.group, "SDK Agent group"); assert.equal(variable.saveState, true);
  assert.equal(f.flushes(), 1); assert.equal(f.session.getState().lastChangeSource, "agent");
  assert.equal(f.session.getHistoryState().undoDepth, 2); assert.equal(f.otherSession.getState().revision, 0);
  assert.match(f.session.getState().content, /files\/unchanged\.txt/); assert.match(f.session.getState().content, /1e999/);
  assert.match(f.session.getState().content, /0\.1234567890123456789012345/);
  f.controller.undo(); assert.equal(f.controller.getSurface("main").getPresent().variables[0]!.desc, "human variable without blur");
  assert.equal(f.controller.getSurface("main").getPresent().variables[0]!.group, "original group");
});

test("stopping after an actual SDK variable commit retains its applied fact and cannot continue or replay", { timeout: 10_000 }, async t => {
  let proof!: ReadReceipt, applied: StructuredToolResult | undefined;
  const f = harness(t, (body, index, signal) => {
    const scopeId = body.liveProgramDocument.scope.scopeId;
    if (index === 0) return stream(toolChunks("variable-stop-read", { scopeId, action: "read_live", variableFor: selector }));
    assert.equal(index, 1); proof = readOutput(body, "variable-stop-read");
    return stream(toolChunks("variable-stop-edit", editInput(scopeId, proof)).slice(0, 3), signal, true);
  }, { afterTool(id, output, current) { if (id === "variable-stop-edit") { applied = output; void current.stop(); } } });
  await f.sendManual("variable-stop-user"); await Promise.all(f.outputs);
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 2); assert.equal(f.chat.status, "ready");
  assert.ok(applied?.ok); assert.equal((applied.data as { persisted: boolean }).persisted, false);
  assert.equal((applied.data as { applied: boolean }).applied, true);
  const revision = f.session.getState().revision;
  assert.equal(f.turn.getResult("variable-stop-edit"), applied);
  const pending = f.chat.messages.map(message => ({ ...message, parts: message.parts.map(part => "toolCallId" in part && part.toolCallId === "variable-stop-edit"
    ? { ...part, state: "input-available", output: undefined } : part) })) as AgentUIMessage[];
  const repaired = f.turn.repairAfterStoppedDrain(pending, f.chat.status);
  const result = repaired.flatMap(message => message.parts).find(part => "toolCallId" in part && part.toolCallId === "variable-stop-edit") as { state: string; output: unknown };
  assert.equal(result.state, "output-available"); assert.equal(result.output, applied);
  const selected = f.turn.getBody()!.liveProgramDocument; assert.equal(selected.state, "ready"); if (selected.state !== "ready") return;
  const replay = await f.turn.executeAsync("variable-stop-edit", editInput(selected.scope.scopeId, proof)); assert.deepEqual(replay, applied);
  await f.chat.addToolOutput({ tool: "workspace_program", toolCallId: "variable-stop-edit", output: applied });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.requests.length, 2); assert.equal(f.session.getState().revision, revision);
  assert.equal(f.mutationCalls(), 1, "neither duplicate SDK output nor receipt replay can perform a second commit");
});

test("Ask's actual SDK variable read cannot turn a model-supplied edit into a writable operation", { timeout: 10_000 }, async t => {
  const f = harness(t, (body, index) => {
    const scopeId = body.liveProgramDocument.scope.scopeId;
    if (index === 0) return stream(toolChunks("ask-variable-read", { scopeId, action: "read_live", variableFor: selector }));
    if (index === 1) return stream(toolChunks("ask-variable-edit", editInput(scopeId, readOutput(body, "ask-variable-read"))));
    assert.equal(index, 2); return stream(finalChunks);
  }, { mode: "ask" });
  await f.sendManual("ask-variable-user"); await Promise.all(f.outputs);
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 3);
  assert.equal(f.controller.getSurface("main").getPresent().variables[0]!.desc, "human variable without blur");
  assert.equal(f.session.getState().lastChangeSource, "ui"); assert.equal(f.session.getHistoryState().undoDepth, 1);
  const denied = f.turn.getResult("ask-variable-edit"); assert.equal(denied?.ok, false);
  assert.equal((denied!.data as { code: string }).code, "tool_mode_denied");
  const scopeId = f.requests[0]!.liveProgramDocument.scope.scopeId;
  const schema = createLiveProgramDocumentTool("read", scopeId).inputSchema as { safeParse(value: unknown): { success: boolean } };
  assert.equal(schema.safeParse({ scopeId, action: "read_live", variableFor: selector }).success, true);
  assert.equal(schema.safeParse(editInput(scopeId, readOutput(f.requests[1]!, "ask-variable-read"))).success, false);
});

test("stopping after the SDK read blocks a late variable edit and no automatic model continuation starts", { timeout: 10_000 }, async t => {
  let read: StructuredToolResult | undefined;
  const f = harness(t, (body, index, signal) => {
    assert.equal(index, 0); return stream(toolChunks("read-then-stop", { scopeId: body.liveProgramDocument.scope.scopeId, action: "read_live", variableFor: selector }).slice(0, 3), signal, true);
  }, { afterTool(id, output, current) { if (id === "read-then-stop") { read = output; void current.stop(); } } });
  await f.sendManual("read-then-stop-user"); await Promise.all(f.outputs);
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 1); assert.ok(read?.ok);
  const receipt = read.data as ReadReceipt, selected = f.turn.getBody()!.liveProgramDocument;
  assert.equal(selected.state, "ready"); if (selected.state !== "ready") return;
  const late = await f.turn.executeAsync("too-late-variable-edit", editInput(selected.scope.scopeId, receipt));
  assert.equal(late.ok, false); assert.equal((late.data as { code: string }).code, "LIVE_DOCUMENT_TURN_STOPPED");
  assert.equal(f.session.getState().lastChangeSource, "ui"); assert.equal(f.session.getHistoryState().undoDepth, 1);
  assert.equal(f.controller.getSurface("main").getPresent().variables[0]!.desc, "human variable without blur");
});

test("SDK history, copied variable markup and malformed variable intent never recreate a private grant", async t => {
  const messages: AgentUIMessage[] = [{ id: "historical-user", role: "user", parts: [{ type: "text", text: "historical variable edit" }] },
    { id: "historical-assistant", role: "assistant", parts: [{ type: "tool-workspace_program", toolCallId: "historical-variable-edit", state: "input-available",
      input: { scopeId: "old-scope", action: "edit_variable_live", readOperationId: "old-read", expectedRevision: 0, ...selector,
        contractRevision: "old-contract", changes: [{ field: "desc", valueJson: '"must never run"' }] } }] }];
  const f = harness(t, () => assert.fail("history hydration must not request a model"), { messages });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(f.callbacks, []); assert.deepEqual(f.executions, []); assert.equal(f.turn.getBody(), undefined);
  for (const text of [f.text, "<qkrpc-program-variable>malformed</qkrpc-program-variable>", "<qkrpc-program-variable data-variable-id=\"typed\">"]) {
    const body = f.turn.begin({ userMessageId: `untrusted-${text.length}`, text, cwd, chatMode: "agent", enabledTools: ["workspace_program"] });
    assert.equal(body?.liveProgramDocument.state, "unavailable", "variable intent cannot become none and restore legacy disk tools");
  }
  assert.equal(f.session.getState().revision, 0); assert.equal(f.requests.length, 0);
});
