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
import { createDesignerCatalogPort } from "./action-editor/catalog/designerCatalogPort";
import type { ActionProjectBinding } from "./action-project-binding";
import type { StepRunnerInputContract } from "./step-runner-input-contract";
import { createLiveProgramDocumentRegistry } from "./live-program-document-registry";
import { createProgramStepTag, formatProgramStepTagMarkup } from "./program-step-tag";
import { workspaceDocumentKey } from "./workspace-document-instances";
import { repairInterruptedToolCalls } from "./repair-interrupted-tool-calls";
import type { AgentUIMessage } from "./chat-types";
import type { StructuredToolResult } from "./tool-result";

const threadId = "sdk-live-thread", cwd = "D:\\sdk-fixture\\original", stepId = "sdk-original-step";
const content = JSON.stringify({ retained: { native: true }, steps: [{ stepId, stepRunnerKey: "sys:delay", note: "baseline", inputParams: { ms: "10" } }], variables: [] });
const inputContent = `{"retained":{"int64":9223372036854775807,"decimal":0.1234567890123456789012345},"steps":[{"stepId":"${stepId}","stepRunnerKey":"sys:notify","note":"baseline","inputParams":{"type":"Info","style":"Default","msg":"before"},"outputParams":{"errMessage":"original_error"}}],"variables":[]}`;
// Explicit runtime-definition facts, without a runtime dependency on a local host export.
const inputContract: StepRunnerInputContract = {
  version: 1, source: "runtime-definition", hostKind: "v1", stepRunnerKey: "sys:notify",
  controlFieldKey: "style", appliedControlFieldValue: "Default", visibilityResolved: true,
  reservedBindings: ["file", "varKey", ".file", ".var"], inputs: [
    { key: "type", policyKnown: true, varType: 9, variableMode: 0, allowInput: false, isControlField: false,
      visibilityResolved: true, visible: true, literalPolicy: "allowed", literalValueRestriction: "none", blockedReason: null,
      options: ["Success", "Info", "Warning", "Error", "WindowsToast"] },
    { key: "msg", policyKnown: true, varType: 0, variableMode: 0, allowInput: false, isControlField: false,
      visibilityResolved: true, visible: true, literalPolicy: "allowed", literalValueRestriction: "none", blockedReason: null, options: [] },
    { key: "style", policyKnown: true, varType: 9, variableMode: 1, allowInput: false, isControlField: true,
      visibilityResolved: true, visible: true, literalPolicy: "never", literalValueRestriction: "unknown",
      blockedReason: "CONTROL_FIELD_NOT_EDITABLE", options: ["Default", "Style2"] },
  ],
};
type InputFixtureOptions = { beforeContract?: (signal: AbortSignal) => Promise<void> };

/** The real renderer owner chain, without disk, host, model, network listener or
 * an independent Agent loop. Wrappers below observe calls without deciding them. */
function documentFixture(input?: InputFixtureOptions) {
  const projectBinding: ActionProjectBinding | null = input ? {
    schemaVersion: 1, kind: "action", actionId: "11111111-1111-4111-8111-111111111111",
    hostBinding: { hostInstanceId: "sdk-fixture-host", hostSessionId: "a".repeat(32), endpoint: `QuickerRpc_User_${"A".repeat(24)}_${"a".repeat(32)}`,
      protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fake-only", capabilities: { "stepRunner.inputContract.read": true } },
  } : null;
  const identity = { documentKey: "sdk-original-document", projectBinding };
  const session = createProgramDocumentSession({ content: input ? inputContent : content, identity });
  const owner = { key: workspaceDocumentKey(cwd, "file-original"), instanceId: 1, cwd, tabId: "file-original", path: ".quicker/actions/sdk/data.json" };
  const target = { owner, sessionId: "sdk-original-session", identity };
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange() {} });
  const present = controller.getSurface("main").getPresent(); present.steps[0]!.note = "human unsaved note";
  let pendingHumanDraft = input ? present : undefined, humanFlushes = 0;
  if (!input) controller.getSurface("main").commit(present);
  const catalogRequests: { url: string; body: Record<string, unknown>; signal: AbortSignal }[] = [];
  const catalogScope = { cwd, projectDirectory: ".quicker/actions/sdk", expectedProjectBinding: structuredClone(projectBinding) };
  const expectedScope = structuredClone(catalogScope);
  const catalogPort = input ? createDesignerCatalogPort(catalogScope, async (url, init) => {
    assert.equal(url, "/api/step-runner/input-contract", "no UI schema, static fallback, disk, host write, save or sync endpoint is permitted");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.deepEqual(body, { key: "sys:notify", catalogContext: expectedScope }, "the exact cloned binding is used and the first native-default read omits controlField");
    assert.ok(init?.signal instanceof AbortSignal);
    catalogRequests.push({ url: String(url), body, signal: init.signal });
    await input.beforeContract?.(init.signal);
    return Response.json({ ok: true, source: "live", contract: structuredClone(inputContract) });
  }) : undefined;
  // Mutating the caller's object must not retarget the document-owned catalog.
  catalogScope.cwd = "D:\\sdk-fixture\\later-catalog-owner";
  if (catalogScope.expectedProjectBinding) catalogScope.expectedProjectBinding.hostBinding = {
    ...catalogScope.expectedProjectBinding.hostBinding, capabilities: { "stepRunner.inputContract.read": false },
  };
  const endpoint = createProgramDocumentLiveEndpoint({ owner, sessionId: target.sessionId, session, controller, catalogPort, isCurrent: () => true,
    flushPendingEdits() { if (pendingHumanDraft) { controller.getSurface("main").commit(pendingHumanDraft); pendingHumanDraft = undefined; humanFlushes++; } } });
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
    executeAsync(scope, command, options) {
      executions.push(structuredClone({ scope, command }));
      return original.executeAsync(scope, command, options);
    },
    revokeScope(scope, reason) { revocations.push(scope); original.revokeScope(scope, reason); },
  };
  const tag = createProgramStepTag({ tagId: "sdk-live-chip", programTarget: "action", programId: "11111111-1111-4111-8111-111111111111",
    dataJsonPath: owner.path, nodePath: "0", stepRunnerKey: input ? "sys:notify" : "sys:delay", content: '{"note":"stale chip snapshot"}', startLine: 1, endLine: 1, designerStepId: stepId });
  return { session, controller, otherSession, registry, captures, executions, revocations, target, tag, catalogPort, catalogRequests, humanFlushes: () => humanFlushes };
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
  input?: InputFixtureOptions;
} = {}) {
  const document = documentFixture(options.input);
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
    onToolCall: async ({ toolCall }) => {
      seenToolCalls.push(toolCall.toolCallId);
      if (toolCall.toolName !== "workspace_program" || !turn.getBody() || turn.isStopped()) return;
      callbacks.push(toolCall.toolCallId);
      const generation = turn.getGeneration();
      const output = await turn.executeAsync(toolCall.toolCallId, toolCall.input);
      options.afterTool?.(toolCall.toolCallId, output, { stop });
      if (turn.getGeneration() !== generation || turn.isStopped()) return;
      // Same SDK callback contract as useAgentChatSession: never await the
      // SDK's queued addToolOutput job from inside its active streaming job.
      outputs.push(Promise.resolve(chat.addToolOutput({ tool: "workspace_program", toolCallId: toolCall.toolCallId, output })));
    },
  });
  t.after(async () => { turn.dispose(); document.registry.dispose(); document.catalogPort?.dispose(); await chat.stop(); });
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

function toolOutput(body: WireBody, operationId: string): StructuredToolResult {
  const part = body.messages.flatMap((message) => message.parts).find((item) => "toolCallId" in item && item.toolCallId === operationId) as { output?: StructuredToolResult } | undefined;
  assert.ok(part?.output, `the real SDK continuation must carry the ${operationId} tool output`);
  return part.output;
}

test("real AI SDK native input schema read continues into one original-Session parameter transaction", { timeout: 10000 }, async (t) => {
  let humanDraft = "";
  const f = harness(t, (body, index) => {
    const scopeId = body.liveProgramDocument.scope.scopeId;
    if (index === 0) return stream(toolChunks("sdk-input-read", { scopeId, action: "read_live", stepSchemaFor: stepId }));
    if (index === 1) {
      const output = toolOutput(body, "sdk-input-read"); assert.equal(output.ok, true);
      const read = output.data as Extract<LiveProgramDocumentReceipt, { ok: true; action: "read_live" }>;
      assert.equal(read.operationId, "sdk-input-read"); assert.equal(read.revision, 1);
      assert.equal(read.stepInputSchema?.stepId, stepId);
      assert.deepEqual(read.stepInputSchema.contract, { ...inputContract, reservedBindings: [...inputContract.reservedBindings].sort() }, "the decoder retains every explicit native fact and canonicalizes only reserved binding order");
      assert.ok(read.stepInputSchema.editableInputKeys.includes("msg")); assert.ok(!read.stepInputSchema.editableInputKeys.includes("style"));
      assert.match(read.content, /human unsaved note/); humanDraft = read.content;
      return stream(toolChunks("sdk-input-edit", { scopeId, action: "edit_step_inputs_live", readOperationId: read.operationId,
        expectedRevision: read.revision, stepId, changes: [{ key: "msg", value: "Agent changed the existing message" }] }));
    }
    assert.equal(index, 2);
    const output = toolOutput(body, "sdk-input-edit"); assert.equal(output.ok, true);
    const receipt = output.data as Extract<LiveProgramDocumentReceipt, { ok: true; applied: true }>;
    assert.equal(receipt.operationId, "sdk-input-edit"); assert.equal(receipt.applied, true); assert.equal(receipt.persisted, false);
    assert.equal(receipt.revisionBefore, 1); assert.equal(receipt.revisionAfter, 2); assert.equal(receipt.undoable, true);
    return stream(finalChunks);
  }, { input: {} });
  assert.equal(f.session.getState().revision, 0, "the human control draft has not blurred or committed yet");
  await f.sendManual("manual-input-transaction"); await Promise.all(f.outputs);
  assert.deepEqual(f.errors, []); assert.equal(f.chat.status, "ready"); assert.equal(f.requests.length, 3);
  assert.deepEqual(f.callbacks, ["sdk-input-read", "sdk-input-edit"]);
  assert.deepEqual(f.executions.map(({ command }) => command.operationId), ["sdk-input-read", "sdk-input-edit"]);
  assert.equal(f.captures.length, 1); assert.equal(f.humanFlushes(), 1); assert.equal(f.catalogRequests.length, 1, "the exact stored Default matches the native default, so no second lookup is needed");
  assert.deepEqual(f.requests.map((body) => body.liveProgramDocument.scope.userMessageId), Array(3).fill("manual-input-transaction"));
  const state = f.session.getState(), updated = JSON.parse(state.content);
  assert.equal(state.revision, 2); assert.equal(state.lastChangeSource, "agent"); assert.equal(state.dirty, true);
  assert.equal(updated.steps[0].inputParams.msg, "Agent changed the existing message"); assert.equal(updated.steps[0].inputParams.style, "Default");
  assert.equal(updated.steps[0].note, "human unsaved note"); assert.equal(updated.steps[0].outputParams.errMessage, "original_error");
  assert.match(state.content, /9223372036854775807/); assert.match(state.content, /0\.1234567890123456789012345/);
  assert.equal(f.session.getHistoryState().undoDepth, 2); assert.equal(f.otherSession.getState().revision, 0);
  f.controller.undo();
  assert.equal(f.session.getState().content, humanDraft, "one human undo removes the entire Agent batch and retains the unblurred human draft");
  assert.equal(f.session.getHistoryState().undoDepth, 1); assert.equal(f.session.getHistoryState().redoDepth, 1);
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("stop while a real SDK input-schema read is pending aborts it without a late edit or continuation", { timeout: 10000 }, async (t) => {
  const started = deferred<AbortSignal>(), late = deferred<void>();
  t.after(() => late.resolve());
  const f = harness(t, (body, index) => {
    assert.equal(index, 0, "a cancelled metadata read cannot automatically request an edit");
    return stream(toolChunks("sdk-pending-input-read", { scopeId: body.liveProgramDocument.scope.scopeId, action: "read_live", stepSchemaFor: stepId }));
  }, { input: { async beforeContract(signal) { started.resolve(signal); await late.promise; } } });
  const sending = f.sendManual("manual-pending-input-stop");
  const signal = await started.promise;
  await f.stop();
  assert.equal(signal.aborted, true, "Stop reaches the actual bound catalog request");
  await sending; await Promise.all(f.outputs);
  assert.equal(f.chat.status, "ready", "the SDK drains without waiting for the ignored late fetch response");
  const revision = f.session.getState().revision;
  late.resolve(); await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 1); assert.equal(f.outputs.length, 0);
  assert.equal(revision, 1); assert.equal(f.session.getState().revision, revision); assert.equal(f.session.getHistoryState().undoDepth, 1);
  assert.equal(JSON.parse(f.session.getState().content).steps[0].inputParams.msg, "before");
  assert.equal(f.catalogRequests.length, 1); assert.deepEqual(f.executions.map(({ command }) => command.operationId), ["sdk-pending-input-read"]);
  const messages = f.chat.messages, repaired = f.turn.repairAfterStoppedDrain(messages, f.chat.status);
  if (messages !== repaired) f.chat.messages = repaired;
  const pending = f.chat.messages.flatMap((message) => message.parts).find((part) => "toolCallId" in part && part.toolCallId === "sdk-pending-input-read") as { state: string; output?: StructuredToolResult };
  assert.ok(pending.state === "output-available" || pending.state === "output-error");
  if (pending.output) assert.equal(pending.output.ok, false);
});

test("stopping after a real SDK input edit retains its applied receipt and never replays or continues", { timeout: 10000 }, async (t) => {
  let applied: StructuredToolResult | undefined;
  const f = harness(t, (body, index, signal) => {
    const scopeId = body.liveProgramDocument.scope.scopeId;
    if (index === 0) return stream(toolChunks("sdk-read-input-before-stop", { scopeId, action: "read_live", stepSchemaFor: stepId }));
    assert.equal(index, 1, "Stop after application must prevent the next model request");
    const read = toolOutput(body, "sdk-read-input-before-stop").data as Extract<LiveProgramDocumentReceipt, { ok: true; action: "read_live" }>;
    return stream(toolChunks("sdk-edit-input-before-stop", { scopeId, action: "edit_step_inputs_live", readOperationId: read.operationId,
      expectedRevision: read.revision, stepId, changes: [{ key: "msg", value: "applied input before stop" }] }).slice(0, 3), signal, true);
  }, { input: {}, afterTool(id, output, current) { if (id === "sdk-edit-input-before-stop") { applied = output; void current.stop(); } } });
  await f.sendManual("manual-applied-input-stop"); await Promise.all(f.outputs);
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 2); assert.equal(f.chat.status, "ready");
  assert.ok(applied?.ok); assert.equal(f.turn.getResult("sdk-edit-input-before-stop"), applied);
  const receipt = applied.data as Extract<LiveProgramDocumentReceipt, { ok: true; applied: true }>;
  assert.equal(receipt.applied, true); assert.equal(receipt.persisted, false); assert.equal(receipt.revisionAfter, 2);
  assert.equal(f.session.getState().revision, 2); assert.equal(f.session.getHistoryState().undoDepth, 2);
  assert.equal(JSON.parse(f.session.getState().content).steps[0].inputParams.msg, "applied input before stop");
  const messages = f.chat.messages, repaired = f.turn.repairAfterStoppedDrain(messages, f.chat.status);
  if (messages !== repaired) f.chat.messages = repaired;
  const edit = f.chat.messages.flatMap((message) => message.parts).find((part) => "toolCallId" in part && part.toolCallId === "sdk-edit-input-before-stop") as { state: string; output: unknown };
  assert.equal(edit.state, "output-available"); assert.equal(edit.output, applied);
  await f.chat.addToolOutput({ tool: "workspace_program", toolCallId: "sdk-edit-input-before-stop", output: applied });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.requests.length, 2); assert.equal(f.executions.length, 2); assert.equal(f.session.getState().revision, 2);
});

test("a pending SDK input read from the old generation cannot acknowledge a new manual turn", { timeout: 10000 }, async (t) => {
  const started = deferred<AbortSignal>(), late = deferred<void>();
  t.after(() => late.resolve());
  const f = harness(t, (body, index) => {
    if (index === 0) return stream(toolChunks("sdk-old-input-read", { scopeId: body.liveProgramDocument.scope.scopeId, action: "read_live", stepSchemaFor: stepId }));
    assert.equal(index, 1); assert.equal(body.liveProgramDocument.scope.userMessageId, "manual-new-input-turn");
    return stream(finalChunks);
  }, { input: { async beforeContract(signal) { started.resolve(signal); await late.promise; } } });
  const oldSend = f.sendManual("manual-old-input-turn");
  const signal = await started.promise;
  const newSend = f.sendManual("manual-new-input-turn");
  assert.equal(signal.aborted, true);
  await oldSend; await newSend; await Promise.all(f.outputs);
  late.resolve(); await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 2); assert.equal(f.chat.status, "ready");
  assert.equal(f.captures.length, 2); assert.equal(f.outputs.length, 0, "the old callback never publishes addToolOutput into the new generation");
  assert.equal(f.turn.getResult("sdk-old-input-read"), undefined); assert.equal(f.session.getState().revision, 1);
  assert.equal(JSON.parse(f.session.getState().content).steps[0].inputParams.msg, "before");
  assert.equal(f.catalogRequests.length, 1); assert.equal(f.executions.length, 1);
});
