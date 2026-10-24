import assert from "node:assert/strict";
import test from "node:test";
import { createProgramDocumentSession } from "../document/programDocumentSession";
import { createProgramDocumentEditorController } from "./programDocumentEditorController";
import { createProgramDocumentLiveEndpoint } from "./liveProgramDocumentEndpoint";
import { createLiveProgramDocumentRegistry } from "../../live-program-document-registry";

function fixture() {
  const owner = { cwd: "C:/fixture", path: "action/data.json", tabId: "file", instanceId: 1, key: "fixture" };
  const session = createProgramDocumentSession({ identity: { documentKey: "fixture", projectBinding: null }, content: '{"steps":[],"variables":[],"subPrograms":[{"id":"child","name":"child","kind":1,"steps":[{"stepId":"selected","stepRunnerKey":"future","note":"before","opaque":9007199254740993}],"variables":[],"subPrograms":[]}]}' });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange() {} });
  const endpoint = createProgramDocumentLiveEndpoint({ owner, sessionId: "session", session, controller, isCurrent: () => true, flushPendingEdits() {} });
  const registry = createLiveProgramDocumentRegistry({ isOwnerCurrent: () => true }); registry.register(owner, endpoint);
  const request = () => ({ stepId: "selected", expectedRevision: session.getState().revision, expectedIdentity: session.getState().identity, note: "Agent note" });
  return { owner, session, controller, registry, request };
}

test("an existing private pin cannot edit a step whose parent became a foreign cache", () => {
  const f = fixture(), pin = f.registry.pin(f.owner, "tag", "selected", "chat"); assert.ok("pinId" in pin);
  const changed = f.session.readSnapshot(); changed.subPrograms[0]!.kind = 2;
  assert.equal(f.session.applySnapshot(changed, { expectedRevision: f.session.getState().revision, source: "ui" }).ok, true);
  const captured = f.registry.captureForManualSend({ pins: [pin], threadId: "chat", userMessageId: "manual", cwd: f.owner.cwd, mode: "edit" });
  assert.equal(captured.state, "ready"); if (captured.state !== "ready") return;
  const scope = captured.scope, read = f.registry.execute(scope, { scopeId: scope.scopeId, operationId: "read", input: { action: "read_live" } });
  assert.equal(read.ok, true);
  const before = f.session.getState(), command = { scopeId: scope.scopeId, operationId: "edit", input: {
    action: "edit_live" as const, readOperationId: "read", expectedRevision: read.revision!, stepId: "selected", note: "must not edit foreign" } };
  const result = f.registry.execute(scope, command);
  assert.equal(result.ok, false); assert.equal(result.code, "identity_conflict"); assert.equal(f.session.getState(), before);
  // A refused operation remains a stable receipt after the user makes the target editable again.
  const restored = f.session.readSnapshot(); restored.subPrograms[0]!.kind = 1;
  f.session.applySnapshot(restored, { expectedRevision: before.revision, source: "ui" });
  assert.deepEqual(f.registry.execute(scope, command), result);
  assert.equal(f.session.readSnapshot().subPrograms[0]!.steps[0]!.note, "before");
});

test("raw uniqueness/ownership also rejects foreign descendants and alias ambiguity without history", () => {
  for (const failure of ["foreign", "ancestor", "duplicate", "alias", "missing"] as const) {
    const f = fixture(), raw = JSON.parse(f.session.getState().content);
    const child = raw.subPrograms[0];
    if (failure === "foreign") child.kind = 3;
    if (failure === "ancestor") raw.subPrograms = [{ id: "cache", kind: 2, steps: [], variables: [], subPrograms: [child] }];
    if (failure === "duplicate") raw.subPrograms.push({ ...structuredClone(child), id: "foreign", kind: 2 });
    if (failure === "alias") child.steps[0].StepId = "other";
    if (failure === "missing") child.steps = [];
    assert.equal(f.session.transact({ expectedRevision: f.session.getState().revision, source: "ui", update: () => raw }).ok, true);
    const before = f.session.getState(), result = f.controller.applyAgentStepNote(f.request());
    assert.equal(result.ok, false, failure); assert.equal(f.session.getState(), before, failure);
  }
});

test("generic ownership permits a no-input-map owned note and keeps one undo plus raw unknown fields", () => {
  const f = fixture(), surface = f.controller.getSurface("sub-child"), human = surface.getPresent();
  human.steps[0]!.note = "human draft"; surface.commit(human);
  const before = f.session.getState(), result = f.controller.applyAgentStepNote(f.request());
  assert.equal(result.ok, true); assert.match(f.session.getState().content, /9007199254740993/);
  assert.equal(f.session.getHistoryState().undoDepth, before.history.undoDepth + 1);
  f.controller.undo(); assert.equal(surface.getPresent().steps[0]!.note, "human draft");
});

test("owned preflight preserves stale revision/identity/closed failure codes and zero edits", () => {
  for (const failure of ["revision", "identity", "closed"] as const) {
    const f = fixture(), request = f.request();
    if (failure === "revision") request.expectedRevision = 99;
    if (failure === "identity") request.expectedIdentity = { ...request.expectedIdentity, documentKey: "different" };
    if (failure === "closed") f.session.close();
    const before = f.session.getState(), result = f.controller.applyAgentStepNote(request);
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, failure === "revision" ? "revision_conflict" : failure === "identity" ? "identity_conflict" : "closed");
    assert.equal(f.session.getState(), before);
  }
});
