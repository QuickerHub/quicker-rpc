import assert from "node:assert/strict";
import { test } from "node:test";
import { createLiveProgramDocumentRegistry } from "./live-program-document-registry";
import { createProgramDocumentSession } from "./action-editor/document/programDocumentSession";
import { createProgramDocumentEditorController } from "./action-editor/program/programDocumentEditorController";
import { createProgramDocumentLiveEndpoint } from "./action-editor/program/liveProgramDocumentEndpoint";
import { workspaceDocumentKey } from "./workspace-document-instances";
import { parseActionProjectBinding } from "./action-project-binding";
import { applyProgramDocumentStepInputs } from "./action-editor/document/programDocumentStepInputs";
import { readStepRunnerInputContract, STEP_RUNNER_INPUT_CONTRACT_CAPABILITY, type StepRunnerInputContract } from "./step-runner-input-contract";
import type { LiveProgramDocumentEndpoint, LiveProgramDocumentPin, LiveProgramDocumentReceipt, LiveProgramDocumentScope } from "./live-program-document";
import { sourceStepTestTarget } from "./source-step-live-test-fixture";
import type { XProgramPresent } from "./action-editor/program/xProgramHistory";

const content = '{"steps":[{"stepId":"one","stepRunnerKey":"future:one","note":"original","future":9223372036854775807}],"variables":[],"subPrograms":[{"id":"child","name":"Child","steps":[{"stepId":"nested","stepRunnerKey":"future:two","note":"nested"}],"variables":[],"subPrograms":[]}],"future":1e999}';
function fixture(source = false) {
  let sequence = 0, current = true, pendingNote: string | undefined;
  const owner = { cwd: "C:/fixture", path: ".quicker/actions/a/data.json", tabId: "file:a", instanceId: 1, key: workspaceDocumentKey("C:/fixture", "file:a") };
  let sourceTarget = source ? sourceStepTestTarget(content, "one", "future:one") : undefined;
  const session = createProgramDocumentSession({ content, identity: { documentKey: "fixture:a", ...(sourceTarget
    ? { storage: { key: "source-bundle", version: sourceTarget.sourceSnapshot.revision } } : { projectBinding: null }) } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => current, onChange() {} });
  const endpoint = createProgramDocumentLiveEndpoint({ owner, sessionId: "session-a", session, controller, isCurrent: () => current,
    ...(source ? { sourceTarget: () => sourceTarget && structuredClone(sourceTarget) } : {}), flushPendingEdits() {
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
    close() { current = false; }, draft(note: string) { pendingNote = note; }, setSourceTarget(value: typeof sourceTarget) { sourceTarget = value; }, sourceTarget: () => sourceTarget };
}
const failed = (receipt: LiveProgramDocumentReceipt, code: string) => { assert.equal(receipt.ok, false); if (receipt.ok) throw Error("Expected failure"); assert.equal(receipt.code, code); return receipt; };

test("Source document-local step evidence supports only the selected row in the original Session and one undo", () => {
  const f = fixture(true); f.draft("source human draft"); const scope = f.capture(), proof = f.read(scope);
  assert.equal(scope.target.format, "source-bundle"); assert.equal(scope.target.identity.projectBinding, undefined);
  assert.equal(f.sourceTarget()!.stepIdentity!.steps[0]!.nativeIdentity, "unknown");
  const result = f.edit(scope, proof); assert.equal(result.ok, true); assert.equal(result.persisted, false);
  assert.match(f.session.getState().content, /9223372036854775807/); assert.match(f.session.getState().content, /1e999/);
  f.controller.undo(); assert.equal(f.session.readSnapshot().steps[0]!.note, "source human draft");
  assert.equal(f.session.getState().dirty, true);
});

test("old source codecs without step metadata keep their document target but cannot mint a step grant", () => {
  const f = fixture(true), previous = f.sourceTarget()!;
  f.setSourceTarget({ ...previous, stepIdentity: undefined });
  assert.ok(f.endpoint.getTarget(), "source target remains available for old variable/local-save paths");
  const result = f.registry.pin(f.owner, "old-cli", "one", "chat-a");
  assert.equal("ok" in result && result.ok, false);
  if ("ok" in result) assert.equal(result.code, "LIVE_STEP_ORIGIN_UNAVAILABLE");
  assert.equal(f.session.getState().revision, 0);
});

test("legacy and Source step grants do not survive delete/recreate, branch moves, runner changes or old mapping epochs", () => {
  for (const source of [false, true]) for (const change of ["replace", "move", "runner"]) {
    const f = fixture(source), pin = f.pin(), scope = f.capture([pin]), original = structuredClone(f.session.readSnapshot().steps[0]!);
    const changePresent = (update: (present: XProgramPresent) => void) => {
      const present = f.controller.getSurface("main").getPresent(); update(present); f.controller.getSurface("main").commit(present);
    };
    if (change === "replace") { changePresent(p => { p.steps = []; }); changePresent(p => { p.steps = [original]; }); }
    if (change === "move") changePresent(p => { p.steps = [{ ...original, stepId: "new-parent", ifSteps: [original] }]; });
    if (change === "runner") changePresent(p => { p.steps[0]!.stepRunnerKey = "different:module"; });
    const proof = f.read(scope, `read-${change}`), result = f.edit(scope, proof, "must not transfer", `edit-${change}`);
    assert.equal(result.ok, false, `${source}:${change}`); assert.doesNotMatch(f.session.getState().content, /must not transfer/);
  }
  const f = fixture(true), pin = f.pin();
  f.setSourceTarget({ ...f.sourceTarget()!, mappingEpoch: 2 });
  assert.equal(f.registry.captureForManualSend({ pins: [pin], mode: "edit", userMessageId: "after-save", threadId: "chat-a", cwd: f.owner.cwd }).state, "unavailable");
});

test("Source mapping observes every row before its first pin; delete/recreate, move and Undo cannot revive old origin", () => {
  for (const change of ["replace", "move", "runner"]) {
    const f = fixture(true), original = structuredClone(f.session.readSnapshot().steps[0]!);
    const present = f.controller.getSurface("main").getPresent();
    if (change === "replace") present.steps = [];
    if (change === "move") present.steps = [{ ...original, stepId: "new-parent", ifSteps: [original] }];
    if (change === "runner") present.steps[0]!.stepRunnerKey = "different:module";
    f.controller.getSurface("main").commit(present);
    assert.equal(f.session.getState().revision, 1);
    if (change === "replace") {
      const rebuilt = f.controller.getSurface("main").getPresent(); rebuilt.steps = [original];
      f.controller.getSurface("main").commit(rebuilt);
      assert.equal(f.session.getState().revision, 2);
    }
    const before = f.session.getState(), denied = f.registry.pin(f.owner, "first-pin-after-change", "one", "chat-a");
    assert.ok("ok" in denied && denied.ok === false, change); assert.equal(f.session.getState(), before);
    if (change === "move" || change === "runner") {
      f.controller.undo();
      const restored = f.registry.pin(f.owner, "first-pin-after-undo", "one", "chat-a");
      assert.ok("ok" in restored && restored.ok === false, `${change}:undo`);
    }
  }
});

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

// Real Session/raw transaction fixture for asynchronous native metadata; no host or model is used.
function inputFixture(inputs: Record<string, unknown> = { text: "before", empty: "", mode3: "old", choice: "first" }, supported = true, sourceBundle = false) {
  let sequence = 0, current = true, busy = false, writes = 0;
  const owner = { cwd: "C:/fixture", path: ".quicker/actions/input/data.json", tabId: "file:input", instanceId: 1, key: workspaceDocumentKey("C:/fixture", "file:input") };
  const binding = parseActionProjectBinding({ schemaVersion: 1, kind: "action", actionId: "11111111-1111-4111-8111-111111111111",
    hostBinding: { hostInstanceId: "fixture", hostSessionId: "a".repeat(32), endpoint: `QuickerRpc_User_${"C".repeat(24)}_${"a".repeat(32)}`,
      protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: { [STEP_RUNNER_INPUT_CONTRACT_CAPABILITY]: supported } } }, "11111111-1111-4111-8111-111111111111");
  const source = `{"steps":[{"stepId":"one","stepRunnerKey":"sys:fixture","note":"original","inputParams":${JSON.stringify(inputs)}},{"stepId":"two","stepRunnerKey":"sys:fixture","inputParams":{"text":"other"}}],"variables":[],"subPrograms":[],"opaque":9223372036854775807}`;
  const sourceTarget = sourceBundle ? sourceStepTestTarget(source, "one", "sys:fixture", binding.hostBinding) : undefined;
  const session = createProgramDocumentSession({ content: source, identity: { documentKey: "input-document", ...(sourceTarget
    ? { storage: { key: "source-bundle", version: sourceTarget.sourceSnapshot.revision } } : { projectBinding: binding }) } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => current, onChange() {} });
  const base = createProgramDocumentLiveEndpoint({ owner, sessionId: "input-session", session, controller, isCurrent: () => current && !busy,
    ...(sourceTarget ? { sourceTarget: () => structuredClone(sourceTarget) } : {}), flushPendingEdits() {} });
  const calls: { input: { stepRunnerKey: string; controlFieldValue?: string }; signal?: AbortSignal }[] = [];
  let metadata = async (_input: { stepRunnerKey: string; controlFieldValue?: string }, _signal?: AbortSignal) => inputSchema();
  const endpoint: LiveProgramDocumentEndpoint = { ...base,
    readInputContract(input, signal) { calls.push({ input, signal }); return metadata(input, signal); },
    setStepInputs(input) {
      writes++; const before = session.getState().revision, result = applyProgramDocumentStepInputs(session, input);
      return result.ok ? { ok: true, changed: result.changed, revisionBefore: before, revisionAfter: result.state.revision, dirty: result.state.dirty } : result;
    },
  };
  const registry = createLiveProgramDocumentRegistry({ isOwnerCurrent: (candidate) => current && candidate === owner, createId: () => `input-${++sequence}` });
  let release = registry.register(owner, endpoint);
  const capture = (threadId = "chat-a", mode: "read" | "edit" = "edit") => {
    const pin = registry.pin(owner, `input-tag-${++sequence}`, "one", threadId);
    assert.equal("ok" in pin, false);
    const selected = registry.captureForManualSend({ pins: [pin as LiveProgramDocumentPin], threadId, userMessageId: `manual-${++sequence}`, cwd: owner.cwd, mode });
    assert.equal(selected.state, "ready"); if (selected.state !== "ready") throw Error("scope"); return selected.scope;
  };
  const command = (scope: LiveProgramDocumentScope, operationId = "schema", stepSchemaFor = "one") =>
    ({ scopeId: scope.scopeId, operationId, input: { action: "read_live" as const, stepSchemaFor } });
  const schema = async (scope: LiveProgramDocumentScope, operationId = "schema") => {
    const result = await registry.executeAsync(scope, command(scope, operationId));
    assert.equal(result.ok, true, JSON.stringify(result)); if (!result.ok || result.action !== "read_live") throw Error("schema read"); return result;
  };
  const edit = (scope: LiveProgramDocumentScope, proof: { operationId: string; revision: number }, changes = [{ key: "text", value: "after" }], operationId = "edit") =>
    registry.execute(scope, { scopeId: scope.scopeId, operationId, input: { action: "edit_step_inputs_live", readOperationId: proof.operationId, expectedRevision: proof.revision, stepId: "one", changes } });
  return { registry, session, controller, endpoint, owner, calls, capture, command, schema, edit,
    writes: () => writes, metadata(fn: typeof metadata) { metadata = fn; }, busy(value: boolean) { busy = value; },
    release: () => release(), replace(value: LiveProgramDocumentEndpoint) { release = registry.register(owner, value); },
    draft() { const next = controller.getSurface("main").getPresent(); next.steps[0]!.note = "human"; controller.getSurface("main").commit(next); } };
}
function inputSchema(patch: Record<string, unknown> = {}): StepRunnerInputContract {
  const row = (key: string, extra = {}) => ({ key, policyKnown: true, varType: 0, variableMode: 0, allowInput: false, isControlField: false,
    visibilityResolved: true, visible: true, literalPolicy: "allowed", literalValueRestriction: "none", blockedReason: null, options: [], ...extra });
  return readStepRunnerInputContract({ version: 1, source: "runtime-definition", hostKind: "v1", stepRunnerKey: "sys:fixture",
    controlFieldKey: null, appliedControlFieldValue: null, visibilityResolved: true, reservedBindings: ["file", "varKey", ".file", ".var"],
    inputs: [row("text"), row("empty"), row("mode3", { variableMode: 3, literalPolicy: "existing-nonempty-literal-only" }),
      row("choice", { literalValueRestriction: "options", options: ["first", "next"] })], ...patch }, { hostKind: "v1", stepRunnerKey: "sys:fixture" });
}
function deferredInput<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const inputTick = () => new Promise<void>((done) => setImmediate(done));

test("schema-backed input editing commits on the actual Session synchronously and undoes one whole batch", async () => {
  const f = inputFixture(), scope = f.capture(), proof = await f.schema(scope);
  assert.deepEqual(proof.stepInputSchema?.editableInputKeys, ["text", "empty", "mode3", "choice"]);
  assert.equal(f.calls.length, 1);
  const command = { scopeId: scope.scopeId, operationId: "batch", input: { action: "edit_step_inputs_live" as const, readOperationId: proof.operationId,
    expectedRevision: proof.revision, stepId: "one", changes: [{ key: "text", value: "after" }, { key: "mode3", value: "" }, { key: "choice", value: "next" }] } };
  const resultPromise = f.registry.executeAsync(scope, command);
  assert.equal(f.session.getState().revision, 1, "mutation and receipt commit before the promise is returned");
  const receipt = await resultPromise; assert.equal(receipt.ok, true); assert.equal(f.calls.length, 1);
  assert.match(f.session.getState().content, /9223372036854775807/); assert.equal(f.session.getState().lastChangeSource, "agent");
  f.registry.revokeScope(scope.scopeId, "stopped after apply");
  assert.deepEqual(f.registry.execute(scope, command, { isCancelled: () => true }), receipt); assert.equal(f.writes(), 1);
  f.controller.undo(); assert.equal(f.session.readSnapshot().steps[0]!.inputParams.text.value, "before");
  assert.equal(f.session.readSnapshot().steps[0]!.inputParams.mode3.value, "old");
});

test("private schema proof cannot be forged from a plain read receipt or caller-mutated metadata", async () => {
  const f = inputFixture(), scope = f.capture();
  const plain = f.registry.execute(scope, { scopeId: scope.scopeId, operationId: "plain", input: { action: "read_live" } });
  assert.equal(plain.ok, true); if (!plain.ok || plain.action !== "read_live") return;
  failed(f.edit(scope, plain, undefined, "no-schema"), "LIVE_INPUT_SCHEMA_REQUIRED");
  const proof = await f.schema(scope);
  (proof.stepInputSchema!.editableInputKeys as string[]).push("invented");
  failed(f.edit(scope, proof, [{ key: "invented", value: "bad" }]), "LIVE_STEP_INPUT_UNSUPPORTED");
  assert.equal(f.writes(), 0);
});

test("only this turn's pinned step can request metadata or input mutation, and Ask stays read-only", async () => {
  const f = inputFixture(), scope = f.capture();
  failed(await f.registry.executeAsync(scope, f.command(scope, "other", "two")), "LIVE_STEP_NOT_GRANTED");
  assert.equal(f.calls.length, 0);
  const readonly = f.capture("chat-b", "read"), proof = await f.schema(readonly);
  failed(f.edit(readonly, proof), "tool_mode_denied"); assert.equal(f.writes(), 0);
});

test("native control uses actual raw value and requests the exact same key again, including empty literals", async () => {
  for (const control of ["custom", ""]) {
    const f = inputFixture({ text: "before", operation: control }), scope = f.capture();
    f.metadata(async (input) => inputSchema({ controlFieldKey: "operation", appliedControlFieldValue: input.controlFieldValue ?? "native-default" }));
    await f.schema(scope);
    assert.deepEqual(f.calls.map((call) => call.input), [{ stepRunnerKey: "sys:fixture" }, { stepRunnerKey: "sys:fixture", controlFieldValue: control }]);
  }
  const missing = inputFixture(), scope = missing.capture();
  missing.metadata(async () => inputSchema({ controlFieldKey: "operation", appliedControlFieldValue: "native-default" }));
  assert.equal((await missing.schema(scope)).ok, true); assert.equal(missing.calls.length, 1);
});

test("bound opaque dynamic or unproven control cannot borrow a native default", async () => {
  for (const value of ["@var:operation", "@file:operation", "$=1", "＄=1", "a\u200db", { value: false }]) {
    const f = inputFixture({ text: "before", operation: value }), scope = f.capture();
    f.metadata(async () => inputSchema({ controlFieldKey: "operation", appliedControlFieldValue: "native-default" }));
    failed(await f.registry.executeAsync(scope, f.command(scope)), "LIVE_INPUT_CONTROL_UNAVAILABLE");
    assert.equal(f.calls.length, 1); assert.equal(f.writes(), 0);
  }
  const f = inputFixture(), scope = f.capture();
  f.metadata(async () => inputSchema({ controlFieldKey: "operation", appliedControlFieldValue: null, visibilityResolved: false }));
  failed(await f.registry.executeAsync(scope, f.command(scope)), "LIVE_INPUT_CONTROL_UNAVAILABLE");
});

test("same operation coalesces observers, payload conflicts fail, and one observer abort does not stop another", async () => {
  const f = inputFixture(), scope = f.capture(), reply = deferredInput<StepRunnerInputContract>();
  f.metadata(async () => reply.promise);
  const abort = new AbortController(), command = f.command(scope);
  const first = f.registry.executeAsync(scope, command, { abortSignal: abort.signal });
  const second = f.registry.executeAsync(scope, command);
  await inputTick(); assert.equal(f.calls.length, 1);
  failed(await f.registry.executeAsync(scope, f.command(scope, "schema", "two")), "LIVE_OPERATION_CONFLICT");
  abort.abort(); failed(await first, "REQUEST_ABORTED"); assert.equal(f.calls[0].signal?.aborted, false);
  reply.resolve(inputSchema()); const complete = await second; assert.equal(complete.ok, true);
  assert.deepEqual(await f.registry.executeAsync(scope, command), complete); assert.equal(f.calls.length, 1);
});

test("last observer abort and scope revocation cancel pending metadata promptly; late results mint no proof", async () => {
  for (const how of ["last", "revoke", "new-manual", "endpoint", "dispose"] as const) {
    const f = inputFixture(), scope = f.capture(), reply = deferredInput<StepRunnerInputContract>(), abort = new AbortController();
    f.metadata(async () => reply.promise);
    const command = f.command(scope), pending = f.registry.executeAsync(scope, command, { abortSignal: abort.signal });
    await inputTick();
    if (how === "last") abort.abort();
    else if (how === "revoke") f.registry.revokeScope(scope.scopeId, "stop");
    else if (how === "new-manual") f.capture();
    else if (how === "endpoint") f.release();
    else f.registry.dispose();
    const receipt = await pending; assert.equal(receipt.ok, false, how); assert.equal(f.calls[0].signal?.aborted, true, how);
    reply.resolve(inputSchema()); await inputTick();
    assert.deepEqual(await f.registry.executeAsync(scope, command), receipt, how); assert.equal(f.writes(), 0);
  }
});

test("revision full identity busy and malformed schema changes while awaiting metadata never authorize edits", async () => {
  for (const how of ["revision", "busy", "identity", "malformed"] as const) {
    const f = inputFixture(), scope = f.capture(), reply = deferredInput<StepRunnerInputContract>();
    f.metadata(async () => reply.promise);
    const pending = f.registry.executeAsync(scope, f.command(scope));
    await inputTick();
    if (how === "revision") f.draft();
    if (how === "busy") f.busy(true);
    if (how === "identity") f.replace({ ...f.endpoint, getTarget: () => ({ ...f.endpoint.getTarget()!, sessionId: "new-session" }) });
    reply.resolve(how === "malformed" ? { ...inputSchema(), source: "ui" } as unknown as StepRunnerInputContract : inputSchema());
    assert.equal((await pending).ok, false, how); assert.equal(f.writes(), 0);
  }
});

test("two concurrent scopes retain separate metadata cancellation and read proof ownership", async () => {
  const f = inputFixture(), a = f.capture("chat-a"), b = f.capture("chat-b"), replies = [deferredInput<StepRunnerInputContract>(), deferredInput<StepRunnerInputContract>()];
  f.metadata(async () => replies[f.calls.length - 1].promise);
  const first = f.registry.executeAsync(a, f.command(a, "a")), second = f.registry.executeAsync(b, f.command(b, "b"));
  await inputTick(); f.registry.revokeScope(a.scopeId, "only chat-a stopped");
  assert.equal((await first).ok, false); assert.equal(f.calls[0].signal?.aborted, true); assert.equal(f.calls[1].signal?.aborted, false);
  replies[0].resolve(inputSchema()); replies[1].resolve(inputSchema());
  const proof = await second; assert.equal(proof.ok, true);
  failed(f.edit(b, { operationId: "a", revision: 0 }), "LIVE_READ_REQUIRED"); assert.equal(f.writes(), 0);
});

test("metadata decomposition consumes one operation budget and replay never repeats a native read", async () => {
  const f = inputFixture({ text: "before", operation: "custom" }), scope = f.capture();
  f.metadata(async (input) => inputSchema({ controlFieldKey: "operation", appliedControlFieldValue: input.controlFieldValue ?? "native-default" }));
  for (let i = 0; i < 3; i++) {
    const command = f.command(scope, `schema-${i}`), result = await f.registry.executeAsync(scope, command);
    assert.equal(result.ok, true); assert.deepEqual(await f.registry.executeAsync(scope, command), result);
  }
  assert.equal(f.calls.length, 6);
  failed(await f.registry.executeAsync(scope, f.command(scope, "fourth")), "tool_call_limit"); assert.equal(f.calls.length, 6);
});

test("input batch failure is atomic, stale reads cannot write, and possible post-commit failure is never replayed", async () => {
  const f = inputFixture(), scope = f.capture(), proof = await f.schema(scope);
  failed(f.edit(scope, proof, [{ key: "text", value: "next" }, { key: "choice", value: "unknown" }], "atomic"), "LIVE_STEP_INPUT_UNSUPPORTED");
  assert.equal(f.writes(), 0); assert.equal(f.session.getState().revision, 0);
  f.draft(); failed(f.edit(scope, proof), "revision_conflict"); assert.equal(f.writes(), 0);
  const next = inputFixture(); let writes = 0;
  next.replace({ ...next.endpoint, setStepInputs(input) { writes++; next.endpoint.setStepInputs!(input); throw Error("lost input commit acknowledgement"); } });
  const owned = next.capture(), read = await next.schema(owned), result = failed(next.edit(owned, read), "LIVE_RESULT_UNKNOWN");
  assert.equal(result.application, "unknown"); assert.deepEqual(next.edit(owned, read), result); assert.equal(writes, 1);
});

test("poll-style cancellation while native metadata settles preserves the same failed receipt on replay", async () => {
  const f = inputFixture(), scope = f.capture(), reply = deferredInput<StepRunnerInputContract>();
  let stopped = false; f.metadata(async () => reply.promise);
  const command = f.command(scope), pending = f.registry.executeAsync(scope, command, { isCancelled: () => stopped });
  await inputTick(); stopped = true; reply.resolve(inputSchema());
  const receipt = failed(await pending, "REQUEST_ABORTED");
  assert.deepEqual(await f.registry.executeAsync(scope, command), receipt); assert.equal(f.writes(), 0);
});

test("input receipts survive cancellation raised inside the real synchronous transaction", async () => {
  const f = inputFixture(); let stopped = false, calls = 0;
  f.replace({ ...f.endpoint, setStepInputs(input) {
    calls++; const result = f.endpoint.setStepInputs!(input); stopped = true; f.registry.revokeScope(scope.scopeId, "stop inside commit"); return result;
  } });
  const scope = f.capture(), proof = await f.schema(scope), command = { scopeId: scope.scopeId, operationId: "sync-input", input: {
    action: "edit_step_inputs_live" as const, readOperationId: proof.operationId, expectedRevision: proof.revision, stepId: "one", changes: [{ key: "text", value: "committed" }],
  } };
  const receipt = f.registry.execute(scope, command, { isCancelled: () => stopped });
  assert.equal(stopped, true); assert.equal(receipt.ok, true); assert.equal(calls, 1);
  assert.deepEqual(await f.registry.executeAsync(scope, command, { isCancelled: () => true }), receipt);
  assert.equal(f.session.readSnapshot().steps[0]!.inputParams.text.value, "committed");
});

test("legacy and Source metadata need an actual declared port but the same endpoint still supports the original note workflow", async () => {
  for (const source of [false, true]) for (const how of ["port", "capability"] as const) {
    const f = inputFixture(undefined, how !== "capability", source);
    if (how === "port") f.replace({ ...f.endpoint, readInputContract: undefined });
    const scope = f.capture();
    failed(await f.registry.executeAsync(scope, f.command(scope)), "LIVE_INPUT_CONTRACT_UNAVAILABLE"); assert.equal(f.calls.length, 0);
    const proof = f.registry.execute(scope, { scopeId: scope.scopeId, operationId: "note-read", input: { action: "read_live" } });
    assert.equal(proof.ok, true); if (!proof.ok || proof.action !== "read_live") return;
    assert.equal(f.registry.execute(scope, { scopeId: scope.scopeId, operationId: "note-edit", input: { action: "edit_live",
      readOperationId: proof.operationId, expectedRevision: proof.revision, stepId: "one", note: "still supported" } }).ok, true);
  }
});

test("Source input proof keeps binding, file, dynamic, control and unknown policies closed without a legacy binding", async () => {
  const f = inputFixture({ text: "before", file: "@file:owned.txt", binding: "@var:selected", dynamic: "$=1", operation: "mode", opaque: "before" }, true, true);
  const scope = f.capture(); assert.equal(scope.target.identity.projectBinding, undefined);
  const row = inputSchema().inputs[0]!;
  f.metadata(async (input) => inputSchema({ controlFieldKey: "operation", appliedControlFieldValue: input.controlFieldValue ?? "mode",
    inputs: [row, ...["file", "binding", "dynamic"].map(key => ({ ...row, key })),
      { ...row, key: "operation", isControlField: true }, { ...row, key: "opaque", policyKnown: false, literalPolicy: "unknown" }] }));
  const proof = await f.schema(scope);
  assert.deepEqual(proof.stepInputSchema?.editableInputKeys, ["text"]);
  for (const key of ["file", "binding", "dynamic", "operation", "opaque", "invented"])
    failed(f.edit(scope, proof, [{ key, value: "must not write" }], `refuse-${key}`), "LIVE_STEP_INPUT_UNSUPPORTED");
  assert.equal(f.writes(), 0); assert.equal(f.session.getState().revision, 0);
});

test("Source malformed native metadata and a mapping change while awaiting it cannot mint input proof", async () => {
  for (const change of ["malformed", "mapping"] as const) {
    const f = inputFixture(undefined, true, true), scope = f.capture(), pendingSchema = deferredInput<StepRunnerInputContract>();
    f.metadata(async () => pendingSchema.promise);
    const pending = f.registry.executeAsync(scope, f.command(scope)); await inputTick();
    if (change === "mapping") f.replace({ ...f.endpoint, getTarget: () => {
      const target = f.endpoint.getTarget()!;
      return target.format === "source-bundle" ? { ...target, source: { ...target.source, mappingEpoch: target.source.mappingEpoch + 1 } } : target;
    } });
    pendingSchema.resolve(change === "malformed" ? { ...inputSchema(), source: "ui" } as unknown as StepRunnerInputContract : inputSchema());
    assert.equal((await pending).ok, false, change); assert.equal(f.writes(), 0); assert.equal(f.session.getState().revision, 0);
  }
});

test("a second control response cannot retarget the native control key or apply a different raw value", async () => {
  for (const patch of [{ controlFieldKey: "other", appliedControlFieldValue: "custom" }, { controlFieldKey: "operation", appliedControlFieldValue: "changed" }]) {
    const f = inputFixture({ text: "before", operation: "custom" }), scope = f.capture();
    f.metadata(async () => inputSchema(f.calls.length === 1 ? { controlFieldKey: "operation", appliedControlFieldValue: "native-default" } : patch));
    failed(await f.registry.executeAsync(scope, f.command(scope)), "LIVE_INPUT_CONTROL_UNAVAILABLE"); assert.equal(f.calls.length, 2);
  }
});

test("a synchronous burst reserves at most 128 operation slots before scheduling any metadata jobs", async () => {
  const f = inputFixture(), scope = f.capture(), held = deferredInput<StepRunnerInputContract>();
  f.metadata(async () => held.promise);
  const commands = Array.from({ length: 160 }, (_, index) => f.command(scope, `burst-${index}`));
  const pending = commands.map((command) => f.registry.executeAsync(scope, command));
  failed(await pending[128], "LIVE_OPERATION_LIMIT");
  await inputTick();
  assert.ok(f.calls.length > 0, "accepted early operations still reach the metadata port; the burst cannot invalidate all reserved slots");
  assert.ok(f.calls.length <= 128);
  f.registry.revokeScope(scope.scopeId, "cancel accepted burst");
  const receipts = await Promise.all(pending);
  for (let index = 0; index < 128; index++)
    assert.deepEqual(await f.registry.executeAsync(scope, commands[index]), receipts[index]);
  for (let index = 128; index < 160; index++) {
    failed(receipts[index], "LIVE_OPERATION_LIMIT");
    const changed = f.command(scope, `burst-${index}`, "two");
    failed(await f.registry.executeAsync(scope, changed), "LIVE_OPERATION_LIMIT");
  }
  held.resolve(inputSchema()); await inputTick();
  assert.equal(f.writes(), 0);
});
