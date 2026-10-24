import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { Chat } from "@ai-sdk/react";
import { createAgentChatTransport, type AgentChatTransportRefs } from "./agent-chat-transport";
import { lastAssistantMessageIsCompleteWithClientResponses } from "./chat-auto-submit";
import { createLiveProgramDocumentTurn } from "./live-program-document-turn";
import { createLiveProgramDocumentTool } from "./live-program-document-tool";
import type { LiveProgramDocumentRegistry, LiveProgramDocumentScope, LiveProgramDocumentCommand, LiveProgramDocumentReceipt } from "./live-program-document";
import { createProgramDocumentSession } from "./action-editor/document/programDocumentSession";
import { createProgramDocumentEditorController } from "./action-editor/program/programDocumentEditorController";
import { createProgramDocumentLiveEndpoint } from "./action-editor/program/liveProgramDocumentEndpoint";
import { createLiveProgramDocumentRegistry } from "./live-program-document-registry";
import { createProgramStepTag, formatProgramStepTagMarkup } from "./program-step-tag";
import { workspaceDocumentKey } from "./workspace-document-instances";
import { repairInterruptedToolCalls } from "./repair-interrupted-tool-calls";
import type { AgentUIMessage } from "./chat-types";
import type { StructuredToolResult } from "./tool-result";

const threadId = "sdk-live-thread", cwd = "D:\\sdk-fixture\\original", stepId = "sdk-original-step";
const content = JSON.stringify({ retained: { native: true }, steps: [{ stepId, stepRunnerKey: "sys:delay", note: "baseline", inputParams: { ms: "10" } }], variables: [] });

/** The real renderer owner chain, without disk, host, model, network listener or
 * an independent Agent loop. Wrappers below observe calls without deciding them. */
function documentFixture() {
  const identity = { documentKey: "sdk-original-document", projectBinding: null };
  const session = createProgramDocumentSession({ content, identity });
  const owner = { key: workspaceDocumentKey(cwd, "file-original"), instanceId: 1, cwd, tabId: "file-original", path: ".quicker/actions/sdk/data.json" };
  const target = { owner, sessionId: "sdk-original-session", identity };
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange() {} });
  const present = controller.getSurface("main").getPresent(); present.steps[0]!.note = "human unsaved note";
  controller.getSurface("main").commit(present);
  const endpoint = createProgramDocumentLiveEndpoint({ owner, sessionId: target.sessionId, session, controller, isCurrent: () => true, flushPendingEdits() {} });
  const otherOwner = { ...owner, key: workspaceDocumentKey(cwd, "file-other"), tabId: "file-other", instanceId: 2, path: ".quicker/actions/other/data.json" };
  const otherSession = createProgramDocumentSession({ content, identity: { ...identity, documentKey: "sdk-other-document" } });
  const otherController = createProgramDocumentEditorController(otherSession, { isCurrent: () => true, onChange() {} });
  const otherEndpoint = createProgramDocumentLiveEndpoint({ owner: otherOwner, sessionId: "sdk-other-session", session: otherSession, controller: otherController, isCurrent: () => true, flushPendingEdits() {} });
  let sequence = 0;
  const original = createLiveProgramDocumentRegistry({ isOwnerCurrent: (candidate) => candidate === owner || candidate === otherOwner, createId: () => `sdk-private-${++sequence}` });
  original.register(owner, endpoint); original.register(otherOwner, otherEndpoint);
  const captures: Parameters<LiveProgramDocumentRegistry["captureForManualSend"]>[0][] = [];
  const executions: { scope: LiveProgramDocumentScope; command: LiveProgramDocumentCommand }[] = [];
  const revocations: string[] = [];
  const registry: LiveProgramDocumentRegistry = {
    ...original,
    captureForManualSend(input) {
      captures.push(structuredClone(input));
      return original.captureForManualSend(input);
    },
    execute(scope, command, options) {
      executions.push(structuredClone({ scope, command }));
      return original.execute(scope, command, options);
    },
    revokeScope(scope, reason) { revocations.push(scope); original.revokeScope(scope, reason); },
  };
  const tag = createProgramStepTag({ tagId: "sdk-live-chip", programTarget: "action", programId: "11111111-1111-4111-8111-111111111111",
    dataJsonPath: owner.path, nodePath: "0", stepRunnerKey: "sys:delay", content: '{"note":"stale chip snapshot"}', startLine: 1, endLine: 1, designerStepId: stepId });
  return { session, controller, otherSession, registry, captures, executions, revocations, target, tag };
}

type WireBody = Record<string, unknown> & { messages: AgentUIMessage[]; liveProgramDocument: { state: "ready"; scope: LiveProgramDocumentScope } };
type WireChunk = Record<string, unknown>;
const toolChunks = (id: string, input: unknown): WireChunk[] => [{ type: "start", messageId: "sdk-assistant" }, { type: "start-step" },
  { type: "tool-input-available", toolCallId: id, toolName: "workspace_program", input }, { type: "finish-step" }, { type: "finish", finishReason: "tool-calls" }];
const finalChunks: WireChunk[] = [{ type: "start", messageId: "sdk-assistant" }, { type: "start-step" }, { type: "text-start", id: "final-text" },
  { type: "text-delta", id: "final-text", delta: "Updated the original live document." }, { type: "text-end", id: "final-text" },
  { type: "finish-step" }, { type: "finish", finishReason: "stop" }];
function stream(chunks: WireChunk[], signal?: AbortSignal | null, holdOpen = false) {
  const encoder = new TextEncoder();
  let removeAbort = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const abort = () => controller.error(new DOMException("Fixture fetch aborted", "AbortError"));
      for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      if (holdOpen) { signal?.addEventListener("abort", abort, { once: true }); removeAbort = () => signal?.removeEventListener("abort", abort); }
      else { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); }
    }, cancel() { removeAbort(); },
  });
  return new Response(body, { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
}

function harness(t: TestContext, response: (body: WireBody, index: number, signal?: AbortSignal | null) => Response, options: {
  messages?: AgentUIMessage[]; afterTool?: (id: string, output: StructuredToolResult, current: { stop(): Promise<void> }) => void;
} = {}) {
  const document = documentFixture();
  let registry = document.registry;
  const turn = createLiveProgramDocumentTurn({ threadId, getRegistry: () => registry });
  const refs: AgentChatTransportRefs = { threadId, chatMode: { current: "agent" }, enabledTools: { current: ["workspace_program", "docs"] },
    llmSelection: { current: "fixture-no-model" }, workingDirectory: { current: cwd }, titleManual: { current: false },
    designerEmbedScoped: { current: false }, actionDesigner: { current: undefined }, liveProgramDocumentTurn: turn.getBody };
  const requests: WireBody[] = [], outputs: Promise<void>[] = [], errors: Error[] = [], callbacks: string[] = [], seenToolCalls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, "/api/chat", "only the in-memory chat transport endpoint is accepted");
    const body = JSON.parse(String(init?.body)) as WireBody;
    requests.push(body);
    assert.ok(requests.length <= 6, "a client continuation must terminate rather than start another Agent loop");
    return response(body, requests.length - 1, init?.signal);
  });
  let chat: Chat<AgentUIMessage>;
  const stop = async () => { turn.stop(); await chat.stop(); };
  chat = new Chat<AgentUIMessage>({ id: threadId, messages: options.messages, transport: createAgentChatTransport(refs),
    sendAutomaticallyWhen: (input) => !(turn.getBody() && turn.isStopped()) && lastAssistantMessageIsCompleteWithClientResponses(input),
    onError: (error) => { errors.push(error); },
    onToolCall: ({ toolCall }) => {
      seenToolCalls.push(toolCall.toolCallId);
      if (toolCall.toolName !== "workspace_program" || !turn.getBody() || turn.isStopped()) return;
      callbacks.push(toolCall.toolCallId);
      const output = turn.execute(toolCall.toolCallId, toolCall.input);
      options.afterTool?.(toolCall.toolCallId, output, { stop });
      // Same SDK callback contract as useAgentChatSession: never await the
      // SDK's queued addToolOutput job from inside its active streaming job.
      outputs.push(chat.addToolOutput({ tool: "workspace_program", toolCallId: toolCall.toolCallId, output }));
    },
  });
  t.after(async () => { turn.dispose(); document.registry.dispose(); await chat.stop(); });
  const text = `Edit this live step ${formatProgramStepTagMarkup(document.tag)}`;
  const sendManual = (id: string) => {
    const pin = document.registry.pin(document.target.owner, document.tag.tagId, stepId, threadId);
    assert.equal("ok" in pin, false, JSON.stringify(pin));
    turn.rememberPin(document.tag.tagId, pin);
    turn.begin({ userMessageId: id, text, cwd: refs.workingDirectory.current!, chatMode: refs.chatMode.current, enabledTools: refs.enabledTools.current });
    return chat.sendMessage({ id, role: "user", parts: [{ type: "text", text }] });
  };
  return { ...document, turn, refs, chat, stop, requests, outputs, errors, callbacks, seenToolCalls, sendManual,
    replaceRegistry(next: LiveProgramDocumentRegistry) { registry = next; } };
}

test("real AI SDK read/addToolOutput/automatic edit continuation freezes the manual document turn", { timeout: 10000 }, async (t) => {
  const f = harness(t, (body, index) => {
    const scopeId = body.liveProgramDocument.scope.scopeId;
    if (index === 0) return stream(toolChunks("sdk-read-operation", { scopeId, action: "read_live" }));
    if (index === 1) {
      const read = body.messages.flatMap((message) => message.parts).find((part) => "toolCallId" in part && part.toolCallId === "sdk-read-operation") as { output: StructuredToolResult };
      const receipt = read.output.data as Extract<LiveProgramDocumentReceipt, { action: "read_live"; ok: true }>;
      assert.match(receipt.content, /human unsaved note/); assert.equal(receipt.revision, 1);
      return stream(toolChunks("sdk-edit-operation", { scopeId, action: "edit_live", readOperationId: receipt.operationId,
        expectedRevision: receipt.revision, stepId, note: "Agent edited the live note" }));
    }
    assert.equal(index, 2); return stream(finalChunks);
  }, { afterTool(id) {
    if (id === "sdk-read-operation") {
      f.refs.workingDirectory.current = "D:\\sdk-fixture\\another-file";
      f.refs.chatMode.current = "ask";
      f.refs.enabledTools.current = [];
      f.replaceRegistry({ ...f.registry, execute() { assert.fail("the later registry must never receive the original turn"); } });
    }
  } });
  await f.sendManual("actual-manual-user-id"); await Promise.all(f.outputs);
  assert.deepEqual(f.errors, []); assert.equal(f.chat.status, "ready"); assert.equal(f.requests.length, 3);
  assert.equal(f.captures.length, 1); assert.equal(f.captures[0]!.userMessageId, "actual-manual-user-id");
  for (const request of f.requests) {
    assert.equal(request.messages.find((message) => message.role === "user")?.id, "actual-manual-user-id");
    assert.equal(request.liveProgramDocument.scope.userMessageId, "actual-manual-user-id");
    assert.equal(request.liveProgramDocument.scope.scopeId, f.requests[0]!.liveProgramDocument.scope.scopeId);
    assert.equal(request.workingDirectory, cwd); assert.equal(request.chatMode, "agent"); assert.deepEqual(request.enabledTools, ["workspace_program", "docs"]);
    assert.equal(request.liveProgramDocument.scope.target.sessionId, f.target.sessionId);
  }
  const schema = createLiveProgramDocumentTool("edit", f.requests[0]!.liveProgramDocument.scope.scopeId).inputSchema as { safeParse(value: unknown): { success: boolean } };
  assert.equal(schema.safeParse({ action: "read_live", scopeId: f.requests[0]!.liveProgramDocument.scope.scopeId }).success, true);
  assert.equal(schema.safeParse({ action: "read_live", scopeId: "a-different-scope" }).success, false);
  assert.deepEqual(f.executions.map(({ command }) => command.operationId), ["sdk-read-operation", "sdk-edit-operation"]);
  assert.deepEqual(f.callbacks, ["sdk-read-operation", "sdk-edit-operation"]);
  assert.equal(f.session.getState().revision, 2); assert.equal(f.session.getState().dirty, true);
  assert.equal(f.session.getState().lastChangeSource, "agent"); assert.equal(f.otherSession.getState().revision, 0);
  assert.equal(JSON.parse(f.session.getState().content).steps[0].note, "Agent edited the live note");
  assert.deepEqual(JSON.parse(f.session.getState().content).retained, { native: true });
  assert.equal(f.session.undo({ expectedRevision: 2, expectedIdentity: f.target.identity, source: "ui" }).ok, true);
  assert.equal(JSON.parse(f.session.getState().content).steps[0].note, "human unsaved note", "human undo owns the same APDE history");
});

test("stop after the SDK edit commits preserves its receipt and cannot start a model continuation or replay", { timeout: 10000 }, async (t) => {
  let applied: StructuredToolResult | undefined;
  const f = harness(t, (body, index, signal) => {
    const scopeId = body.liveProgramDocument.scope.scopeId;
    if (index === 0) return stream(toolChunks("read-before-stop", { scopeId, action: "read_live" }));
    assert.equal(index, 1, "stop must prevent the third model request");
    return stream(toolChunks("edit-before-stop", { scopeId, action: "edit_live", readOperationId: "read-before-stop", expectedRevision: 1, stepId,
      note: "applied before stop" }).slice(0, 3), signal, true);
  }, { afterTool(id, output, current) { if (id === "edit-before-stop") { applied = output; void current.stop(); } } });
  await f.sendManual("manual-stop"); await Promise.all(f.outputs);
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 2); assert.equal(f.chat.status, "ready");
  assert.equal(f.session.getState().revision, 2); assert.equal(f.executions.length, 2); assert.equal(f.turn.getResult("edit-before-stop"), applied);
  assert.equal((applied!.data as { applied: boolean; persisted: boolean }).applied, true); assert.equal((applied!.data as { persisted: boolean }).persisted, false);
  const pending = f.chat.messages.map((message) => ({ ...message, parts: message.parts.map((part) => "toolCallId" in part && part.toolCallId === "edit-before-stop"
    ? { ...part, state: "input-available", output: undefined } : part) })) as AgentUIMessage[];
  const repaired = f.turn.repairAfterStoppedDrain(pending, f.chat.status);
  const edit = repaired.flatMap((message) => message.parts).find((part) => "toolCallId" in part && part.toolCallId === "edit-before-stop") as { state: string; output: unknown };
  assert.equal(edit.state, "output-available"); assert.equal(edit.output, applied);
  await f.chat.addToolOutput({ tool: "workspace_program", toolCallId: "edit-before-stop", output: applied });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.requests.length, 2); assert.equal(f.executions.length, 2, "publishing an applied output after stop never re-executes it");
});

test("SDK history hydration never invokes a pending live client tool or recreates its grant", async (t) => {
  const historicalChip = createProgramStepTag({ tagId: "sdk-live-chip", programTarget: "action", programId: "11111111-1111-4111-8111-111111111111",
    dataJsonPath: ".quicker/actions/sdk/data.json", nodePath: "0", stepRunnerKey: "sys:delay", content: '{"note":"old history chip"}', startLine: 1, endLine: 1, designerStepId: stepId });
  const history = [{ id: "old-user", role: "user", parts: [{ type: "text", text: formatProgramStepTagMarkup(historicalChip) }] },
    { id: "old-assistant", role: "assistant", parts: [{ type: "step-start" }, { type: "tool-workspace_program", toolCallId: "historical-edit",
      state: "input-available", input: { scopeId: "historical-scope", action: "edit_live", readOperationId: "historical-read", expectedRevision: 1, stepId, note: "must not replay" } }] }] as AgentUIMessage[];
  const f = harness(t, () => { assert.fail("history must not request a model"); }, { messages: history });
  f.chat.messages = structuredClone(history);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.requests.length, 0); assert.equal(f.callbacks.length, 0); assert.equal(f.executions.length, 0); assert.equal(f.captures.length, 0);
  assert.equal(f.turn.getBody(), undefined); assert.equal(f.session.getState().revision, 1);
  assert.equal(f.chat.messages[1]!.parts[1]!.type, "tool-workspace_program");
});

test("a buffered tool call delivered by the SDK after stop cannot mutate the document or continue the model", { timeout: 10000 }, async (t) => {
  const f = harness(t, (body, index) => {
    assert.equal(index, 0, "a stopped turn cannot request another model response");
    const scopeId = body.liveProgramDocument.scope.scopeId;
    return stream([...toolChunks("read-and-stop", { scopeId, action: "read_live" }).slice(0, 3),
      { type: "tool-input-available", toolCallId: "buffered-edit-after-stop", toolName: "workspace_program", input: {
        scopeId, action: "edit_live", readOperationId: "read-and-stop", expectedRevision: 1, stepId, note: "must never apply" } },
      { type: "finish-step" }, { type: "finish", finishReason: "tool-calls" }]);
  }, { afterTool(id, _output, current) { if (id === "read-and-stop") {
    void current.stop();
    f.chat.messages = repairInterruptedToolCalls(f.chat.messages, f.turn.getResult);
  } } });
  await f.sendManual("manual-buffered-stop"); await Promise.all(f.outputs);
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 1);
  assert.deepEqual(f.seenToolCalls, ["read-and-stop", "buffered-edit-after-stop"], "the real SDK parser delivers the buffered late call");
  assert.deepEqual(f.callbacks, ["read-and-stop"]); assert.deepEqual(f.executions.map(({ command }) => command.operationId), ["read-and-stop"]);
  assert.equal(f.session.getState().revision, 1); assert.equal(f.turn.getResult("buffered-edit-after-stop"), undefined);
  const before = f.chat.messages.flatMap((message) => message.parts).find((part) => "toolCallId" in part && part.toolCallId === "buffered-edit-after-stop") as { state: string };
  assert.equal(before.state, "input-available", "the late call arrives after the immediate stop repair");
  assert.equal(f.turn.repairAfterStoppedDrain(f.chat.messages, "streaming"), f.chat.messages, "only a drained stream is finalized");
  let notifications = 0;
  const finalizeDrained = () => {
    const current = f.chat.messages;
    const repaired = f.turn.repairAfterStoppedDrain(current, f.chat.status);
    if (repaired !== current) f.chat.messages = repaired;
  };
  const unsubscribe = f.chat["~registerMessagesCallback"](() => {
    assert.ok(++notifications < 3, "a no-op SDK setter would cause a message feedback loop");
    finalizeDrained();
  });
  try {
    finalizeDrained();
    finalizeDrained();
    assert.equal(notifications, 1, "the already finalized SDK store is never updated again");
  } finally { unsubscribe(); }
  const after = f.chat.messages.flatMap((message) => message.parts).find((part) => "toolCallId" in part && part.toolCallId === "buffered-edit-after-stop") as { state: string };
  assert.equal(after.state, "output-error", "the stopped tool no longer displays a permanent running state");
  assert.equal(f.requests.length, 1); assert.equal(f.session.getState().revision, 1);
});

test("an old scope arriving through a real later SDK stream cannot edit the new manual target", { timeout: 10000 }, async (t) => {
  let oldScope = "";
  const f = harness(t, (body, index) => {
    if (index === 0) { oldScope = body.liveProgramDocument.scope.scopeId; return stream(finalChunks); }
    if (index === 1) return stream(toolChunks("late-old-scope-call", { scopeId: oldScope, action: "edit_live", readOperationId: "old-read", expectedRevision: 1, stepId, note: "wrong turn" }));
    assert.equal(index, 2); return stream(finalChunks);
  });
  await f.sendManual("manual-old");
  await f.sendManual("manual-new"); await Promise.all(f.outputs);
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 3); assert.equal(f.captures.length, 2);
  assert.equal(f.requests[1]!.messages.filter((message) => message.role === "user").at(-1)?.id, "manual-new");
  assert.equal(f.requests[1]!.liveProgramDocument.scope.userMessageId, "manual-new");
  assert.deepEqual(f.callbacks, ["late-old-scope-call"]); assert.equal(f.executions.length, 0);
  assert.equal(f.session.getState().revision, 1); assert.equal(JSON.parse(f.session.getState().content).steps[0].note, "human unsaved note");
  const receipt = f.turn.getResult("late-old-scope-call");
  // Rejected mismatched scopes do not enter the applied-result ledger.
  assert.equal(receipt, undefined);
  const output = f.chat.messages.flatMap((message) => message.parts).find((part) => "toolCallId" in part && part.toolCallId === "late-old-scope-call") as { output: StructuredToolResult };
  assert.equal(output.output.ok, false); assert.equal((output.output.data as { code: string }).code, "LIVE_DOCUMENT_SCOPE_CHANGED");
});
