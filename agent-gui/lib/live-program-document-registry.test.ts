import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveProgramDocumentRegistry } from "./live-program-document-registry";
import { createProgramDocumentSession } from "./action-editor/document/programDocumentSession";
import { createProgramDocumentEditorController } from "./action-editor/program/programDocumentEditorController";
import { createProgramDocumentLiveEndpoint } from "./action-editor/program/liveProgramDocumentEndpoint";
import { workspaceDocumentKey } from "./workspace-document-instances";
import type { LiveProgramDocumentEndpoint, LiveProgramDocumentPin, LiveProgramDocumentReceipt, LiveProgramDocumentScope } from "./live-program-document";

const content = '{"steps":[{"stepId":"one","stepRunnerKey":"future:one","note":"original","future":9223372036854775807}],"variables":[],"subPrograms":[{"id":"child","name":"Child","steps":[{"stepId":"nested","stepRunnerKey":"future:two","note":"nested"}],"variables":[],"subPrograms":[]}],"future":1e999}';
function fixture() {
  let sequence = 0, current = true, pendingNote: string | undefined;
  const owner = { cwd: "C:/fixture", path: ".quicker/actions/a/data.json", tabId: "file:a", instanceId: 1, key: workspaceDocumentKey("C:/fixture", "file:a") };
  const session = createProgramDocumentSession({ content, identity: { documentKey: "fixture:a", projectBinding: null } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => current, onChange() {} });
  const endpoint = createProgramDocumentLiveEndpoint({ owner, sessionId: "session-a", session, controller, isCurrent: () => current, flushPendingEdits() {
    if (pendingNote !== undefined) { const next = controller.getSurface("main").getPresent(); next.steps[0]!.note = pendingNote; pendingNote = undefined; controller.getSurface("main").commit(next); }
  } });
  const registry = createLiveProgramDocumentRegistry({ isOwnerCurrent: (candidate) => current && candidate === owner, createId: () => `id-${++sequence}` });
  let release = registry.register(owner, endpoint);
  const pin = (threadId = "chat-a", tagId = `tag-${sequence}`): LiveProgramDocumentPin => {
    const result = registry.pin(owner, tagId, "one", threadId); assert.equal("ok" in result, false); return result as LiveProgramDocumentPin;
  };
  const capture = (pins = [pin()], mode: "read" | "edit" = "edit", userMessageId = `user-${sequence}`, threadId = "chat-a"): LiveProgramDocumentScope => {
    const result = registry.captureForManualSend({ pins, mode, userMessageId, threadId, cwd: owner.cwd });
    assert.equal(result.state, "ready", JSON.stringify(result)); if (result.state !== "ready") throw Error("Expected a ready scope"); return result.scope;
  };
  const read = (scope: LiveProgramDocumentScope, operationId = `read-${sequence}`) => {
    const result = registry.execute(scope, { scopeId: scope.scopeId, operationId, input: { action: "read_live" } });
    assert.equal(result.ok, true, JSON.stringify(result)); if (!result.ok || result.action !== "read_live") throw Error("Expected read"); return result;
  };
  const edit = (scope: LiveProgramDocumentScope, proof: ReturnType<typeof read>, note = "agent", operationId = `edit-${sequence}`) => registry.execute(scope, {
    scopeId: scope.scopeId, operationId, input: { action: "edit_live", readOperationId: proof.operationId, expectedRevision: proof.revision, stepId: "one", note },
  });
  return { registry, owner, endpoint, session, controller, pin, capture, read, edit, release: () => release(),
    replace(next: LiveProgramDocumentEndpoint) { const old = release; release = registry.register(owner, next); return old; },
    close() { current = false; }, draft(note: string) { pendingNote = note; } };
}
const failed = (receipt: LiveProgramDocumentReceipt, code: string) => { assert.equal(receipt.ok, false); if (receipt.ok) throw Error("Expected failure"); assert.equal(receipt.code, code); return receipt; };

test("actual Session endpoint flushes the human draft, returns complete unsaved content and applies one Agent undo transaction", () => {
  const f = fixture(); f.draft("human draft"); const scope = f.capture(), before = f.read(scope);
  assert.equal(before.dirty, true); assert.match(before.content, /human draft/); assert.match(before.content, /9223372036854775807/);
  assert.equal("content" in scope, false); assert.equal("content" in scope.target, false);
  assert.deepEqual(before.steps.map((step) => [step.stepId, step.surface]), [["one", "main"], ["nested", "sub-child"]]);
  const applied = f.edit(scope, before); assert.equal(applied.ok, true); assert.equal(applied.persisted, false);
  assert.equal(f.session.getState().lastChangeSource, "agent"); assert.equal(f.session.readSnapshot().steps[0]!.note, "agent");
  assert.equal(f.session.getHistoryState().undoDepth, 2); f.controller.undo();
  assert.equal(f.session.readSnapshot().steps[0]!.note, "human draft"); assert.equal(f.session.getHistoryState().undoDepth, 1);
  assert.match(f.session.getState().content, /9223372036854775807/); assert.match(f.session.getState().content, /1e999/);
});

test("only real fresh pins grant a scope, same-document pins combine and each manual send consumes its own refs", () => {
  const f = fixture(), a = f.pin(), b = f.pin();
  const input = { pins: [a, b], mode: "edit" as const, userMessageId: "manual-one", threadId: "chat-a", cwd: f.owner.cwd };
  const first = f.registry.captureForManualSend(input); assert.equal(first.state, "ready"); assert.deepEqual(f.registry.captureForManualSend(input), first);
  assert.equal(f.registry.captureForManualSend({ ...input, userMessageId: "manual-two" }).state, "unavailable");
  assert.equal(f.registry.captureForManualSend({ ...input, pins: [{ ...a, pinId: "history-or-handwritten" }], userMessageId: "manual-three" }).state, "unavailable");
  assert.equal(f.registry.captureForManualSend({ ...input, pins: [], userMessageId: "no-live-intent" }).state, "none");
  const fresh = f.pin(); assert.equal(f.registry.captureForManualSend({ ...input, pins: [fresh], userMessageId: "next" }).state, "ready");
});

test("a real pin authorizes its step in the same Session while the later manual read includes new human edits", () => {
  const f = fixture(), pin = f.pin(); f.draft("changed after pin");
  const scope = f.capture([pin]), proof = f.read(scope);
  assert.match(proof.content, /changed after pin/); assert.equal(proof.revision, 1);
  assert.equal(f.edit(scope, proof).ok, true); f.controller.undo();
  assert.equal(f.session.readSnapshot().steps[0]!.note, "changed after pin");
});

test("a pin whose original step disappeared, became ambiguous or changed complete identity grants no scope", () => {
  for (const change of ["missing", "ambiguous", "identity"] as const) {
    const f = fixture(); let changed = false;
    f.replace({ ...f.endpoint,
      getTarget() { const value = f.endpoint.getTarget()!; return changed && change === "identity" ? { ...value, identity: { ...value.identity, documentKey: "different-document" } } : value; },
      read() { const value = f.endpoint.read(); return changed && change === "ambiguous" && value.ok
        ? { ...value, snapshot: { ...value.snapshot, steps: [...value.snapshot.steps, value.snapshot.steps[0]!] } } : value; },
    });
    const pin = f.pin(); changed = true;
    if (change === "missing") {
      const next = f.controller.getSurface("main").getPresent();
      next.steps = [];
      f.controller.getSurface("main").commit(next);
    }
    const result = f.registry.captureForManualSend({ pins: [pin], mode: "edit", userMessageId: "later", threadId: "chat-a", cwd: f.owner.cwd });
    assert.equal(result.state, "unavailable", change);
  }
});

test("wrong cwd/thread, unknown pin and multiple live endpoints never pick the first document", () => {
  const f = fixture(), pin = f.pin();
  for (const changed of [{ cwd: "C:/other" }, { threadId: "chat-b" }])
    assert.equal(f.registry.captureForManualSend({ pins: [pin], mode: "edit", userMessageId: "manual", threadId: "chat-a", cwd: f.owner.cwd, ...changed }).state, "unavailable");
  const otherOwner = { ...f.owner, instanceId: 2 }, originalTarget = f.endpoint.getTarget()!;
  // Both owners are registered, but an owner outside the actual Workbench owner set cannot authorize a pin.
  const release = f.registry.register(otherOwner, { ...f.endpoint, getTarget: () => ({ ...originalTarget, owner: otherOwner, sessionId: "other" }) });
  assert.equal((f.registry.pin(otherOwner, "other-tag", "one", "chat-a") as { ok: boolean }).ok, false); release();
});

test("pins from two actually current document endpoints produce structured multiple-target unavailability", () => {
  const a = fixture(), b = fixture(), ownerB = { ...b.owner, key: "owner-b", instanceId: 2, path: ".quicker/actions/b/data.json" };
  let sequence = 0;
  const registry = createLiveProgramDocumentRegistry({ isOwnerCurrent: (owner) => owner === a.owner || owner === ownerB, createId: () => `multi-${++sequence}` });
  registry.register(a.owner, a.endpoint);
  registry.register(ownerB, { ...b.endpoint, getTarget: () => ({ ...b.endpoint.getTarget()!, owner: ownerB, sessionId: "session-b" }) });
  const first = registry.pin(a.owner, "a", "one", "chat-a"), second = registry.pin(ownerB, "b", "one", "chat-a");
  assert.equal("ok" in first, false); assert.equal("ok" in second, false);
  const result = registry.captureForManualSend({ pins: [first as LiveProgramDocumentPin, second as LiveProgramDocumentPin], mode: "edit", userMessageId: "multi", threadId: "chat-a", cwd: a.owner.cwd });
  assert.equal(result.state, "unavailable"); if (result.state === "unavailable") assert.equal(result.code, "LIVE_MULTIPLE_DOCUMENTS");
  assert.equal(a.session.getState().revision, 0); assert.equal(b.session.getState().revision, 0);
});

test("a late edit requires the confirmed read revision, and duplicate failures cannot become later mutation permission", () => {
  const f = fixture(), scope = f.capture(), proof = f.read(scope);
  f.draft("new human edit");
  const result = failed(f.edit(scope, proof), "revision_conflict"); assert.equal(result.application, "not_applied");
  assert.deepEqual(f.edit(scope, proof), result); assert.equal(f.session.readSnapshot().steps[0]!.note, "new human edit");
  failed(f.registry.execute(scope, { scopeId: scope.scopeId, operationId: "no-proof", input: { action: "edit_live", readOperationId: "unknown", expectedRevision: f.session.getState().revision, stepId: "one", note: "wrong" } }), "LIVE_READ_REQUIRED");
});

test("the complete document is read context only; edits require this manual scope's actual pinned step subset", () => {
  const f = fixture(), scope = f.capture(), proof = f.read(scope);
  const other = f.registry.execute(scope, { scopeId: scope.scopeId, operationId: "ungranted", input: {
    action: "edit_live", readOperationId: proof.operationId, expectedRevision: proof.revision, stepId: "nested", note: "not authorized",
  } });
  failed(other, "LIVE_STEP_NOT_GRANTED"); assert.equal(f.session.getState().revision, proof.revision);
  assert.equal(f.session.readSnapshot().subPrograms[0]!.steps[0]!.note, "nested");
  const pin = f.pin(), nested = f.registry.pin(f.owner, "nested-tag", "nested", "chat-a"); assert.equal("ok" in nested, false);
  const combined = f.capture([pin, nested as LiveProgramDocumentPin]), current = f.read(combined);
  const changed = f.registry.execute(combined, { scopeId: combined.scopeId, operationId: "authorized", input: {
    action: "edit_live", readOperationId: current.operationId, expectedRevision: current.revision, stepId: "nested", note: "authorized by actual nested pin",
  } });
  assert.equal(changed.ok, true); assert.equal(f.session.readSnapshot().subPrograms[0]!.steps[0]!.note, "authorized by actual nested pin");
  f.controller.undo(); assert.equal(f.session.readSnapshot().subPrograms[0]!.steps[0]!.note, "nested");
});

test("applied receipts survive stop, duplicate delivery, altered payload, changed descriptor and caller mutation without replay", () => {
  const f = fixture(), scope = f.capture(), proof = f.read(scope), result = f.edit(scope, proof);
  assert.equal(result.ok, true); const revision = f.session.getState().revision;
  f.registry.revokeScope(scope.scopeId, "stopped after commit");
  const replay = f.edit(scope, proof); assert.deepEqual(replay, result);
  (replay as { ok: boolean }).ok = false;
  assert.equal(f.edit(scope, proof).ok, true, "caller mutation must not alter the ledger");
  failed(f.edit(scope, proof, "different payload"), "LIVE_OPERATION_CONFLICT");
  const altered = structuredClone(scope); (altered.target as { sessionId: string }).sessionId = "different-session";
  failed(f.edit(altered, proof), "LIVE_SCOPE_CONFLICT");
  assert.equal(f.edit(scope, proof).ok, true); assert.equal(f.session.getState().revision, revision);
});

test("cancellation raised during a confirmed synchronous commit cannot overwrite its applied fact", () => {
  const f = fixture(); let cancelled = false, calls = 0;
  f.replace({ ...f.endpoint, setStepNote(input) { calls++; const result = f.endpoint.setStepNote(input); cancelled = true; return result; } });
  const scope = f.capture(), proof = f.read(scope), command = { scopeId: scope.scopeId, operationId: "commit", input: {
    action: "edit_live" as const, readOperationId: proof.operationId, expectedRevision: proof.revision, stepId: "one", note: "applied before cancellation",
  } };
  const result = f.registry.execute(scope, command, { isCancelled: () => cancelled });
  assert.equal(cancelled, true); assert.equal(result.ok, true); assert.equal(result.persisted, false);
  assert.deepEqual(f.registry.execute(scope, command, { isCancelled: () => true }), result); assert.equal(calls, 1);
});

test("replacement within the same file owner and revision cannot adopt an old scope; old cleanup cannot remove the new endpoint", () => {
  const f = fixture(), scope = f.capture(), proof = f.read(scope);
  const original = f.endpoint.getTarget()!;
  const oldCleanup = f.replace({ ...f.endpoint, getTarget: () => ({ ...original, sessionId: "session-replaced" }) }); oldCleanup();
  failed(f.edit(scope, proof), "LIVE_DOCUMENT_STALE");
  const freshScope = f.capture(); assert.equal(f.read(freshScope).target.sessionId, "session-replaced");
});

test("read-only mode and pre-dispatch cancellation reject edits through the shared operation gate", () => {
  const f = fixture(), scope = f.capture(undefined, "read"), proof = f.read(scope);
  failed(f.edit(scope, proof), "tool_mode_denied");
  const fresh = f.capture([f.pin()], "edit"), command = { scopeId: fresh.scopeId, operationId: "cancelled", input: { action: "read_live" as const } };
  const cancelled = f.registry.execute(fresh, command, { isCancelled: () => true }); failed(cancelled, "REQUEST_ABORTED");
  assert.deepEqual(f.registry.execute(fresh, command), cancelled); assert.equal(f.session.getState().revision, 0);
});

test("the shared per-scope tool call policy counts new commands but not replay of an operation receipt", () => {
  const f = fixture(), scope = f.capture();
  for (let i = 0; i < 3; i++) {
    const receipt = f.read(scope, `read-${i}`);
    assert.deepEqual(f.registry.execute(scope, { scopeId: scope.scopeId, operationId: `read-${i}`, input: { action: "read_live" } }), receipt);
  }
  const limited = f.registry.execute(scope, { scopeId: scope.scopeId, operationId: "read-four", input: { action: "read_live" } });
  failed(limited, "tool_call_limit"); assert.equal(f.session.getState().revision, 0);
});

test("an exception after possible commit preserves unknown application and the same operation is never dispatched twice", () => {
  const f = fixture(); let calls = 0;
  f.replace({ ...f.endpoint, setStepNote(input) { calls++; f.endpoint.setStepNote(input); throw Error("acknowledgement lost after local commit"); } });
  const scope = f.capture(), proof = f.read(scope), unknown = failed(f.edit(scope, proof), "LIVE_RESULT_UNKNOWN");
  assert.equal(unknown.application, "unknown"); assert.deepEqual(f.edit(scope, proof), unknown); assert.equal(calls, 1);
  assert.equal(f.session.readSnapshot().steps[0]!.note, "agent");
});

test("closed original owner/session and a full-read payload limit fail without a fallback", () => {
  const f = fixture(), scope = f.capture(), proof = f.read(scope); f.session.close();
  failed(f.edit(scope, proof), "LIVE_DOCUMENT_STALE");
  const limited = createLiveProgramDocumentRegistry({ isOwnerCurrent: () => true, createId: () => "limited", maxContentBytes: 1 });
  const fresh = fixture(); limited.register(fresh.owner, fresh.endpoint);
  const pin = limited.pin(fresh.owner, "small", "one", "chat-a"); assert.equal("ok" in pin, false);
  const selected = limited.captureForManualSend({ pins: [pin as LiveProgramDocumentPin], mode: "read", userMessageId: "manual", threadId: "chat-a", cwd: fresh.owner.cwd });
  assert.equal(selected.state, "ready"); if (selected.state !== "ready") return;
  failed(limited.execute(selected.scope, { scopeId: selected.scope.scopeId, operationId: "read", input: { action: "read_live" } }), "LIVE_DOCUMENT_TOO_LARGE");
});
