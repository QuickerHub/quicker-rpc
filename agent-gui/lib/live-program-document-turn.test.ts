import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveProgramDocumentTurn } from "./live-program-document-turn";
import type { LiveProgramDocumentRegistry, LiveProgramDocumentScope, LiveProgramDocumentReceipt } from "./live-program-document";
import { createProgramStepTag, formatProgramStepTagMarkup } from "./program-step-tag";
import { workspaceDocumentKey } from "./workspace-document-instances";
import { parseLiveProgramDocumentSelection } from "./live-program-document-selection";
import { parseLiveProgramDocumentToolInput } from "./live-program-document-tool";
import { repairInterruptedToolCalls } from "./repair-interrupted-tool-calls";
import { resolveProgramDiskPathFromWorkspaceTool } from "./program-data-reload-from-tools";
import { expandUserMessageForModel } from "./compose-user-message";
import type { AgentUIMessage } from "./chat-types";

function fixture() {
  const tag = createProgramStepTag({ programTarget: "action", programId: "11111111-1111-4111-8111-111111111111",
    dataJsonPath: ".quicker/actions/fixture/data.json", nodePath: "0", stepRunnerKey: "sys:fixture", content: '{"note":"pin snapshot"}',
    startLine: 1, endLine: 1, designerStepId: "step-one" });
  const cwd = "D:\\fixture", threadId = "thread-one";
  const owner = { key: workspaceDocumentKey(cwd, "file-one"), instanceId: 1, cwd, tabId: "file-one", path: tag.dataJsonPath };
  const target = { owner, sessionId: "actual-session", identity: { documentKey: "actual-document", projectBinding: null } };
  let captures = 0, executions = 0, revocations = 0;
  const registry: LiveProgramDocumentRegistry = {
    register: () => () => {}, pin: () => ({ pinId: "pin-one", tagId: tag.tagId, threadId }),
    captureForManualSend(input) {
      captures++;
      return { state: "ready", scope: { version: 1, scopeId: `scope-${input.userMessageId}`, threadId, userMessageId: input.userMessageId, cwd, mode: input.mode, target } };
    },
    execute(scope, command) {
      executions++;
      const common = { version: 1 as const, source: "live_document" as const, scopeId: scope.scopeId, operationId: command.operationId,
        target: { ownerKey: owner.key, ownerInstanceId: 1, sessionId: target.sessionId, documentKey: target.identity.documentKey }, persisted: false as const };
      return command.input.action === "read_live"
        ? { ...common, ok: true, action: "read_live", complete: true, revision: 3, dirty: true, content: '{"note":"human unsaved"}', steps: [] }
        : { ...common, ok: true, action: "edit_live", applied: true, changed: true, revisionBefore: 3, revisionAfter: 4, dirty: true, undoable: true };
    },
    revokeScope() { revocations++; }, dispose() {},
  };
  const turn = createLiveProgramDocumentTurn({ threadId, getRegistry: () => registry });
  const begin = (id = "user-one", mode: "ask" | "agent" = "agent") => turn.begin({ userMessageId: id,
    text: `modify ${formatProgramStepTagMarkup(tag)}`, cwd, chatMode: mode, enabledTools: ["workspace_program"] });
  const pin = () => turn.rememberPin(tag.tagId, { pinId: "pin-one", tagId: tag.tagId, threadId });
  return { tag, cwd, threadId, target, turn, begin, pin, stats: () => ({ captures, executions, revocations }) };
}

test("only a fresh private step pin grants a manual turn; old, typed and malformed chips never restore disk mode", () => {
  const f = fixture();
  assert.equal(f.begin()?.liveProgramDocument.state, "unavailable");
  assert.equal(f.stats().captures, 0);
  f.pin(); const body = f.begin("granted")!;
  assert.equal(body.liveProgramDocument.state, "ready");
  assert.equal(f.begin("history-replay")?.liveProgramDocument.state, "unavailable");
  assert.equal(f.stats().captures, 1, "a consumed pin cannot grant a later manual message");
  const malformed = f.turn.begin({ userMessageId: "malformed", text: "<qkrpc-program-step>incomplete</qkrpc-program-step>", cwd: f.cwd, chatMode: "agent", enabledTools: [] });
  assert.equal(malformed?.liveProgramDocument.state, "unavailable");
  assert.equal(f.turn.begin({ userMessageId: "normal", text: "plain message", cwd: f.cwd, chatMode: "agent", enabledTools: [] }), undefined);
});

test("live turn body freezes cwd/mode/tool selection; a stale SDK scope ID cannot dispatch to a later manual target", () => {
  const f = fixture(); f.pin(); const first = f.begin()!;
  assert.equal(first.workingDirectory, f.cwd); assert.equal(first.chatMode, "agent");
  assert.throws(() => (first.enabledTools as string[]).push("shell_exec"));
  f.pin(); f.begin("user-two", "ask");
  const wrong = f.turn.execute("late-old-call", { scopeId: "scope-user-one", action: "read_live" });
  assert.equal(wrong.ok, false); assert.equal((wrong.data as any).code, "LIVE_DOCUMENT_SCOPE_CHANGED");
  assert.equal(f.stats().executions, 0);
  const current = f.turn.getBody()!.liveProgramDocument;
  assert.ok(current.state === "ready" && current.scope.mode === "read");
});

test("stop before dispatch cannot edit; an applied receipt survives repair without claiming persistence or reloading disk", () => {
  const f = fixture(); f.pin(); f.begin(); f.turn.stop();
  assert.equal(f.turn.execute("stopped", { scopeId: "scope-user-one", action: "read_live" }).ok, false);
  assert.equal(f.stats().executions, 0);
  f.pin(); f.begin("actual");
  const output = f.turn.execute("edit-operation", { scopeId: "scope-actual", action: "edit_live", readOperationId: "read-operation", expectedRevision: 3, stepId: "step-one", note: "agent note" });
  f.turn.stop();
  const pending = [{ id: "assistant", role: "assistant", parts: [{ type: "tool-workspace_program", toolCallId: "edit-operation", state: "input-available", input: { action: "edit_live" } }] }] as AgentUIMessage[];
  const recovered = repairInterruptedToolCalls(pending, f.turn.getResult)[0].parts[0] as any;
  assert.equal(recovered.state, "output-available"); assert.equal(recovered.output, output);
  assert.equal((output.data as LiveProgramDocumentReceipt).persisted, false);
  assert.equal(resolveProgramDiskPathFromWorkspaceTool("workspace_program", { action: "write_data", id: "11111111-1111-4111-8111-111111111111" }, output), undefined);
});

test("scope parser requires the original manual message, thread, owner and complete identity while retaining unavailable intent", () => {
  const f = fixture(); f.pin(); const selection = f.begin()!.liveProgramDocument;
  const expected = { threadId: f.threadId, userMessageId: "user-one", cwd: "D:/fixture", chatMode: "agent" };
  assert.equal(parseLiveProgramDocumentSelection(selection, expected).state, "ready");
  for (const changed of [{ ...expected, threadId: "other" }, { ...expected, userMessageId: "later" }, { ...expected, cwd: "D:/Fixture" }, { ...expected, chatMode: "ask" }])
    assert.equal(parseLiveProgramDocumentSelection(selection, changed).state, "unavailable");
  const bad = structuredClone(selection) as { state: "ready"; scope: LiveProgramDocumentScope };
  delete (bad.scope.target.identity as any).projectBinding;
  assert.equal(parseLiveProgramDocumentSelection(bad, expected).state, "unavailable");
  assert.equal(parseLiveProgramDocumentSelection(undefined, expected).state, "none");
  assert.equal(parseLiveProgramDocumentSelection({ state: "ready" }, expected).state, "unavailable");
});

test("wire commands require their SDK scope ID; live tag projection uses the current memory protocol", () => {
  const f = fixture();
  assert.equal(parseLiveProgramDocumentToolInput({ action: "read_live" }), undefined);
  assert.equal(parseLiveProgramDocumentToolInput({ scopeId: "scope", action: "read_live", path: "guessed" }), undefined);
  assert.deepEqual(parseLiveProgramDocumentToolInput({ scopeId: "scope", action: "read_live" }), { scopeId: "scope", input: { action: "read_live" } });
  const projected = expandUserMessageForModel(formatProgramStepTagMarkup(f.tag), true);
  assert.match(projected, /read_live/); assert.match(projected, /edit_live/); assert.doesNotMatch(projected, /workspace_program edit_data/);
  assert.match(expandUserMessageForModel(formatProgramStepTagMarkup(f.tag)), /workspace_program edit_data/);
});
