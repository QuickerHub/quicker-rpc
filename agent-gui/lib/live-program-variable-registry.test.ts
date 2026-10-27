import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createLiveProgramDocumentRegistry } from "./live-program-document-registry";
import { createLiveProgramDocumentTool, parseLiveProgramDocumentToolInput } from "./live-program-document-tool";
import { createProgramDocumentSession } from "./action-editor/document/programDocumentSession";
import { createProgramDocumentEditorController } from "./action-editor/program/programDocumentEditorController";
import { createProgramDocumentLiveEndpoint } from "./action-editor/program/liveProgramDocumentEndpoint";
import { workspaceDocumentKey } from "./workspace-document-instances";
import type { LiveProgramDocumentEndpoint, LiveProgramDocumentInput, LiveProgramDocumentPin, LiveProgramDocumentReceipt, LiveProgramDocumentScope } from "./live-program-document";

const main = { surface: "main", variableId: "same-raw-id" };
const child = { surface: "sub-child", variableId: "same-raw-id" };
const content = '{"steps":[{"stepId":"one","stepRunnerKey":"future:kept","note":"human step","future":9223372036854775807}],"variables":[{"id":"same-raw-id","key":"mainValue","varType":0,"defaultValue":"inline before","desc":"main original","group":"before","saveState":false,"isLocked":false,"isInput":false,"isOutput":false,"unknown":{"integer":9223372036854775807,"decimal":0.1234567890123456789012345}},{"id":"other","key":"other","varType":0,"defaultValueFile":"files/untouched.txt","desc":"other original"}],"subPrograms":[{"id":"child","kind":1,"name":"Child","steps":[],"variables":[{"id":"same-raw-id","key":"childValue","varType":0,"defaultValue":"nested before","desc":"nested original","isInput":false,"isOutput":false}],"subPrograms":[]}],"unknownRoot":1e999}';

function fixture(t: TestContext, initial = content) {
  let sequence = 0, current = true, busy = false, rejectFlush = false;
  let pending: { surface: string; desc: string } | undefined;
  const owner = { cwd: "C:/variable-registry-fixture", path: ".quicker/actions/variables/data.json", tabId: "file:variables", instanceId: 1,
    key: workspaceDocumentKey("C:/variable-registry-fixture", "file:variables") };
  const session = createProgramDocumentSession({ content: initial, identity: { documentKey: "variable-fixture", projectBinding: null } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => current, onChange() {} });
  const endpoint = createProgramDocumentLiveEndpoint({ owner, sessionId: "variable-session", session, controller,
    isCurrent: () => current, isLiveEditingBlocked: () => busy,
    flushPendingEdits() {
      if (rejectFlush) return false;
      if (pending) {
        const present = controller.getSurface(pending.surface).getPresent();
        present.variables[0]!.desc = pending.desc;
        controller.getSurface(pending.surface).commit(present); pending = undefined;
      }
    } });
  const registry = createLiveProgramDocumentRegistry({ isOwnerCurrent: candidate => current && candidate === owner, createId: () => `variable-private-${++sequence}` });
  let release = registry.register(owner, endpoint);
  t.after(() => registry.dispose());
  const pin = (selector = main, tagId = `variable-chip-${++sequence}`): LiveProgramDocumentPin => {
    const result = registry.pinVariable(owner, tagId, selector, "chat");
    assert.equal("ok" in result, false, JSON.stringify(result)); return result as LiveProgramDocumentPin;
  };
  const capture = (pins = [pin()], mode: "read" | "edit" = "edit"): LiveProgramDocumentScope => {
    const result = registry.captureForManualSend({ pins, mode, userMessageId: `manual-${++sequence}`, threadId: "chat", cwd: owner.cwd });
    assert.equal(result.state, "ready", JSON.stringify(result)); if (result.state !== "ready") throw Error("A private variable scope is required"); return result.scope;
  };
  const command = (scope: LiveProgramDocumentScope, operationId: string, input: LiveProgramDocumentInput) => ({ scopeId: scope.scopeId, operationId, input });
  const read = (scope: LiveProgramDocumentScope, selector = main, operationId = `variable-read-${++sequence}`) => {
    const result = registry.execute(scope, command(scope, operationId, { action: "read_live", variableFor: selector }));
    assert.equal(result.ok, true, JSON.stringify(result)); if (!result.ok || result.action !== "read_live") throw Error("Expected a complete variable read");
    assert.ok(result.variable, "a targeted read returns a variable contract, not just complete context"); return result;
  };
  const editCommand = (scope: LiveProgramDocumentScope, proof: ReturnType<typeof read>, selector = main, operationId = `variable-edit-${++sequence}`,
    changes = [{ field: "desc", valueJson: JSON.stringify("agent metadata") }]) => command(scope, operationId, {
      action: "edit_variable_live", readOperationId: proof.operationId, expectedRevision: proof.revision,
      ...selector, contractRevision: proof.variable!.contract.revision, changes,
    });
  return { owner, session, controller, endpoint, registry, pin, capture, command, read, editCommand,
    draft(desc: string, surface = "main") { pending = { surface, desc }; },
    busy(value = true) { busy = value; }, rejectFlush(value = true) { rejectFlush = value; },
    retire() { current = false; },
    replace(next: LiveProgramDocumentEndpoint) { const old = release; release = registry.register(owner, next); old(); },
  };
}

function denied(receipt: LiveProgramDocumentReceipt, code?: string) {
  assert.equal(receipt.ok, false, JSON.stringify(receipt)); if (receipt.ok) throw Error("Expected denial");
  if (code) assert.equal(receipt.code, code);
  assert.equal(receipt.persisted, false); return receipt;
}

test("a private variable read flushes current human text and one multi-field Agent transaction shares the original undo", t => {
  const f = fixture(t); f.draft("human without blur");
  const scope = f.capture(), proof = f.read(scope);
  assert.match(proof.variable!.variableJson, /human without blur/);
  assert.match(proof.variable!.variableJson, /9223372036854775807/);
  assert.match(proof.variable!.variableJson, /0\.1234567890123456789012345/);
  assert.equal(proof.variable!.contract.source, "document-controller");
  assert.equal(proof.variable!.contract.nativeValidation, "unobserved");
  const applied = f.registry.execute(scope, f.editCommand(scope, proof, main, "atomic-metadata", [
    { field: "desc", valueJson: '"agent description"' }, { field: "group", valueJson: '"agent group"' },
    { field: "saveState", valueJson: "true" }, { field: "isLocked", valueJson: "true" },
  ]));
  assert.equal(applied.ok, true, JSON.stringify(applied));
  if (!applied.ok || applied.action !== "edit_variable_live") throw Error("Expected variable mutation");
  assert.ok(applied.changedFields);
  assert.deepEqual([...applied.changedFields].sort(), ["desc", "group", "isLocked", "saveState"]);
  assert.equal(applied.surface, main.surface); assert.equal(applied.variableId, main.variableId);
  assert.equal(applied.persisted, false); assert.equal(applied.undoable, true);
  const state = f.session.getState(), variable = f.controller.getSurface("main").getPresent().variables[0]!;
  assert.equal(state.lastChangeSource, "agent"); assert.equal(state.dirty, true);
  assert.equal(variable.desc, "agent description"); assert.equal(variable.group, "agent group");
  assert.equal(variable.saveState, true); assert.equal(variable.isLocked, true);
  assert.equal(f.session.getHistoryState().undoDepth, 2, "one human flush and one Agent transaction");
  assert.match(state.content, /files\/untouched\.txt/); assert.match(state.content, /1e999/);
  assert.match(state.content, /9223372036854775807/); assert.match(state.content, /0\.1234567890123456789012345/);
  f.controller.undo();
  assert.equal(f.controller.getSurface("main").getPresent().variables[0]!.desc, "human without blur");
  assert.equal(f.controller.getSurface("main").getPresent().variables[0]!.group, "before");
  assert.equal(f.controller.getSurface("sub-child").getPresent().variables[0]!.desc, "nested original");
});

test("the same stable variable ID in separate owned surfaces grants only the explicitly pinned surface", t => {
  const f = fixture(t), scope = f.capture([f.pin(child)]), proof = f.read(scope, child);
  denied(f.registry.execute(scope, f.command(scope, "main-is-not-granted", { action: "read_live", variableFor: main })));
  const changed = f.registry.execute(scope, f.editCommand(scope, proof, child, "nested-only"));
  assert.equal(changed.ok, true, JSON.stringify(changed));
  assert.equal(f.controller.getSurface("main").getPresent().variables[0]!.desc, "main original");
  assert.equal(f.controller.getSurface("sub-child").getPresent().variables[0]!.desc, "agent metadata");
  f.controller.undo(); assert.equal(f.session.getState().content, content);
});

test("complete context, another variable proof and step grants cannot become variable edit authority", t => {
  for (const kind of ["plain-read", "other-variable", "step-only", "variable-only-step"] as const) {
    const f = fixture(t);
    const stepPin = f.registry.pin(f.owner, "step-chip", "one", "chat");
    assert.equal("ok" in stepPin, false);
    const scope = f.capture(kind === "step-only" ? [stepPin as LiveProgramDocumentPin] : [f.pin()]);
    const before = f.session.getState();
    if (kind === "other-variable") {
      denied(f.registry.execute(scope, f.command(scope, kind, { action: "read_live", variableFor: { surface: "main", variableId: "other" } })));
    } else if (kind === "step-only") {
      denied(f.registry.execute(scope, f.command(scope, kind, { action: "read_live", variableFor: main })));
    } else if (kind === "variable-only-step") {
      const proof = f.registry.execute(scope, f.command(scope, "context", { action: "read_live" }));
      assert.ok(proof.ok && proof.action === "read_live");
      denied(f.registry.execute(scope, f.command(scope, kind, { action: "edit_live", stepId: "one", note: "not granted",
        readOperationId: proof.operationId, expectedRevision: proof.revision })), "LIVE_STEP_NOT_GRANTED");
    } else {
      const proof = f.registry.execute(scope, f.command(scope, "context", { action: "read_live" }));
      assert.ok(proof.ok && proof.action === "read_live");
      denied(f.registry.execute(scope, f.command(scope, kind, { action: "edit_variable_live", ...main,
        readOperationId: proof.operationId, expectedRevision: proof.revision, contractRevision: "invented", changes: [{ field: "desc", valueJson: '"not authorized"' }] })));
    }
    assert.equal(f.session.getState().revision, before.revision, kind);
    assert.equal(f.session.getState().content, before.content, kind);
  }
});

test("variable pins are consumed for one original manual send and cannot be forged, moved or silently re-granted", t => {
  const f = fixture(t), pin = f.pin();
  const request = { pins: [pin], mode: "edit" as const, userMessageId: "one-manual-message", threadId: "chat", cwd: f.owner.cwd };
  const first = f.registry.captureForManualSend(request); assert.equal(first.state, "ready");
  assert.deepEqual(f.registry.captureForManualSend(request), first);
  for (const change of [{ userMessageId: "history" }, { threadId: "different-chat" }, { cwd: "C:/different-cwd" }, { pins: [{ ...pin, pinId: "typed-private-id" }] }])
    assert.equal(f.registry.captureForManualSend({ ...request, ...change }).state, "unavailable");
  assert.equal(f.session.getState().revision, 0);
});

test("a Session-observed delete and recreate cannot transfer an old variable grant to a replacement with the same raw ID", t => {
  const f = fixture(t), scope = f.capture();
  f.read(scope);
  let removed!: Record<string, unknown>;
  assert.ok(f.session.transact({ expectedRevision: f.session.getState().revision, source: "ui", update(raw) {
    const rows = raw.variables as Record<string, unknown>[];
    const index = rows.findIndex(row => row.id === main.variableId); assert.ok(index >= 0);
    removed = structuredClone(rows[index]!); rows.splice(index, 1);
  } }).ok);
  assert.ok(f.session.transact({ expectedRevision: f.session.getState().revision, source: "ui", update(raw) {
    (raw.variables as Record<string, unknown>[]).push({ ...removed, desc: "replacement using the former ID" });
  } }).ok);
  const revision = f.session.getState().revision;
  denied(f.registry.execute(scope, f.command(scope, "old-grant-after-recreate", { action: "read_live", variableFor: main })));
  assert.equal(f.session.getState().revision, revision);
  const fresh = f.capture(), proof = f.read(fresh);
  assert.match(proof.variable!.variableJson, /replacement using the former ID/);
  assert.equal(f.registry.execute(fresh, f.editCommand(fresh, proof)).ok, true, "only a new private row pin can authorize the replacement");
});

test("human row reordering preserves the original variable subject and one Agent undo keeps the human ordering", t => {
  const f = fixture(t), scope = f.capture();
  assert.ok(f.session.transact({ expectedRevision: f.session.getState().revision, source: "ui", update(raw) {
    (raw.variables as Record<string, unknown>[]).reverse();
  } }).ok);
  const proof = f.read(scope), changed = f.registry.execute(scope, f.editCommand(scope, proof));
  assert.equal(changed.ok, true, JSON.stringify(changed));
  const variables = f.controller.getSurface("main").getPresent().variables;
  assert.equal(variables[0]!.id, "other"); assert.equal(variables[0]!.desc, "other original");
  assert.equal(variables.find(variable => variable.id === main.variableId)!.desc, "agent metadata");
  f.controller.undo();
  const restored = f.controller.getSurface("main").getPresent().variables;
  assert.equal(restored[0]!.id, "other"); assert.equal(restored.find(variable => variable.id === main.variableId)!.desc, "main original");
});

test("idless, locally duplicate, unowned and ambiguous raw surfaces cannot mint a private variable pin", t => {
  const cases = [
    { kind: "idless-projection", body: content.replace('"id":"same-raw-id",', ""), selector: { surface: "main", variableId: "v-1" } },
    { kind: "duplicate-in-surface", body: content.replace('"id":"other"', '"id":"same-raw-id"'), selector: main },
    { kind: "external-cache", body: content.replace('"kind":1', '"kind":2'), selector: child },
    { kind: "duplicate-json-key", body: content.replace('"desc":"main original"', '"desc":"first","desc":"second"'), selector: main },
  ];
  for (const entry of cases) {
    const f = fixture(t, entry.body), result = f.registry.pinVariable(f.owner, `invalid-${entry.kind}`, entry.selector, "chat");
    assert.equal("ok" in result, true, entry.kind);
    if ("ok" in result) assert.equal(result.ok, false, entry.kind);
    assert.equal(f.session.getState().revision, 0, entry.kind);
    assert.equal(f.session.getState().content, entry.body, entry.kind);
  }
});

test("inline defaults and metadata share one transaction while file-backed or opaque defaults deny only that field", t => {
  const inline = fixture(t), inlineScope = inline.capture(), inlineProof = inline.read(inlineScope);
  const edited = inline.registry.execute(inlineScope, inline.editCommand(inlineScope, inlineProof, main, "empty-inline-default", [
    { field: "defaultValue", valueJson: '""' }, { field: "desc", valueJson: '"metadata with default"' },
  ]));
  assert.equal(edited.ok, true, JSON.stringify(edited));
  assert.equal(inline.controller.getSurface("main").getPresent().variables[0]!.defaultValue, "");
  assert.equal(inline.session.getHistoryState().undoDepth, 1); inline.controller.undo();
  assert.equal(inline.session.getState().content, content);
  for (const kind of ["file", "opaque-number", "opaque-object"] as const) {
    const body = kind === "opaque-number" ? content.replace('"defaultValue":"inline before"', '"defaultValue":9007199254740993123456789')
      : kind === "opaque-object" ? content.replace('"defaultValue":"inline before"', '"defaultValue":{"keep":true}') : content;
    const selected = kind === "file" ? { surface: "main", variableId: "other" } : main;
    const f = fixture(t, body), scope = f.capture([f.pin(selected)]), proof = f.read(scope, selected);
    assert.equal(proof.variable!.contract.fields.find(field => field.field === "defaultValue")?.editable, false, kind);
    assert.equal(proof.variable!.contract.fields.find(field => field.field === "desc")?.editable, true, kind);
    denied(f.registry.execute(scope, f.editCommand(scope, proof, selected, `denied-${kind}`, [{ field: "defaultValue", valueJson: '"replacement"' }])));
    assert.equal(f.session.getState().content, body, kind);
    const metadata = f.registry.execute(scope, f.editCommand(scope, proof, selected, `metadata-${kind}`));
    assert.equal(metadata.ok, true, JSON.stringify(metadata));
    if (kind === "file") assert.match(f.session.getState().content, /files\/untouched\.txt/);
    if (kind === "opaque-number") assert.match(f.session.getState().content, /9007199254740993123456789/);
    if (kind === "opaque-object") assert.match(f.session.getState().content, /"keep":\s*true/);
    f.controller.undo(); assert.equal(f.session.getState().content, body, kind);
  }
});

test("Ask reads the selected variable but rejects mutation at the shared tool schema and registry", t => {
  const f = fixture(t), scope = f.capture(undefined, "read"), proof = f.read(scope), command = f.editCommand(scope, proof);
  const schema = createLiveProgramDocumentTool("read", scope.scopeId).inputSchema as { safeParse(value: unknown): { success: boolean } };
  assert.equal(schema.safeParse({ scopeId: scope.scopeId, action: "read_live", variableFor: main }).success, true);
  assert.equal(schema.safeParse({ scopeId: scope.scopeId, ...command.input }).success, false);
  denied(f.registry.execute(scope, command), "tool_mode_denied"); assert.equal(f.session.getState().revision, 0);
});

test("variable proof pins the actual read call, raw revision and field contract before any setter dispatch", t => {
  for (const kind of ["read-call", "contract", "revision", "other-subject"] as const) {
    const f = fixture(t); let calls = 0;
    f.replace({ ...f.endpoint, setVariable(input) { calls++; return f.endpoint.setVariable!(input); } });
    const scope = f.capture(), proof = f.read(scope), command = f.editCommand(scope, proof);
    if (command.input.action !== "edit_variable_live") throw Error("Expected variable command");
    if (kind === "read-call") command.input = { ...command.input, readOperationId: "not-an-actual-sdk-read" };
    if (kind === "contract") command.input = { ...command.input, contractRevision: "forged-contract-revision" };
    if (kind === "other-subject") command.input = { ...command.input, variableId: "other" };
    if (kind === "revision") f.draft("newer human draft");
    const result = f.registry.execute(scope, command); denied(result);
    assert.equal(calls, 0, kind);
    assert.equal(f.session.getState().lastChangeSource, kind === "revision" ? "ui" : undefined, kind);
  }
});

test("busy dialogs, failed human flush and owner replacement preserve the original variable draft", t => {
  for (const kind of ["busy", "flush", "owner", "session"] as const) {
    const f = fixture(t), scope = f.capture(), proof = f.read(scope);
    if (kind === "busy") f.busy();
    if (kind === "flush") { f.draft("unconfirmed invalid human draft"); f.rejectFlush(); }
    if (kind === "owner") f.retire();
    if (kind === "session") f.replace({ ...f.endpoint, getTarget() { return { ...f.endpoint.getTarget()!, sessionId: "replacement-session" }; } });
    denied(f.registry.execute(scope, f.editCommand(scope, proof)));
    assert.equal(f.session.getState().content, content, kind); assert.equal(f.session.getHistoryState().undoDepth, 0, kind);
  }
});

test("applied variable receipts survive stop and duplicate delivery without reapplying or accepting changed input", t => {
  const f = fixture(t); let calls = 0;
  f.replace({ ...f.endpoint, setVariable(input) { calls++; return f.endpoint.setVariable!(input); } });
  const scope = f.capture(), proof = f.read(scope), command = f.editCommand(scope, proof, main, "immutable-variable-result");
  const first = f.registry.execute(scope, command); assert.equal(first.ok, true, JSON.stringify(first));
  const revision = f.session.getState().revision; f.registry.revokeScope(scope.scopeId, "stopped after commit");
  const copy = f.registry.execute(scope, command); assert.deepEqual(copy, first); (copy as { ok: boolean }).ok = false;
  assert.deepEqual(f.registry.execute(scope, command, { isCancelled: () => true }), first);
  if (command.input.action !== "edit_variable_live") throw Error("Expected variable command");
  denied(f.registry.execute(scope, { ...command, input: { ...command.input, changes: [{ field: "desc", valueJson: '"different"' }] } }), "LIVE_OPERATION_CONFLICT");
  assert.equal(calls, 1); assert.equal(f.session.getState().revision, revision);
});

test("cancellation before dispatch cannot write, while cancellation or an exception after commit never replays", t => {
  for (const kind of ["before", "after", "throw-after"] as const) {
    const f = fixture(t); let cancelled = kind === "before", calls = 0;
    f.replace({ ...f.endpoint, setVariable(input) {
      calls++; const result = f.endpoint.setVariable!(input); cancelled = true;
      if (kind === "throw-after") throw Error("Variable acknowledgement lost after actual commit");
      return result;
    } });
    const scope = f.capture(), proof = f.read(scope), command = f.editCommand(scope, proof);
    const result = f.registry.execute(scope, command, { isCancelled: () => cancelled });
    if (kind === "before") { denied(result, "REQUEST_ABORTED"); assert.equal(calls, 0); assert.equal(f.session.getState().revision, 0); }
    else if (kind === "after") { assert.equal(result.ok, true); assert.equal(calls, 1); }
    else { const unknown = denied(result, "LIVE_RESULT_UNKNOWN"); assert.equal(unknown.application, "unknown"); assert.equal(calls, 1); }
    assert.deepEqual(f.registry.execute(scope, command), result); assert.equal(calls, kind === "before" ? 0 : 1);
  }
});

test("variable wire rejects conflicting read selectors and bounded malformed mutations without widening the tool", () => {
  const scopeId = "wire-scope", valid = { scopeId, action: "edit_variable_live", readOperationId: "actual-read", expectedRevision: 0,
    ...main, contractRevision: "current-contract", changes: [{ field: "desc", valueJson: '"allowed"' }] };
  assert.ok(parseLiveProgramDocumentToolInput(valid));
  assert.equal(parseLiveProgramDocumentToolInput({ scopeId, action: "read_live", variableFor: main, stepSchemaFor: "one" }), undefined);
  for (const changed of [
    { variables: [] }, { changes: [] }, { changes: Array.from({ length: 17 }, (_, index) => ({ field: `field-${index}`, valueJson: '"x"' })) },
    { changes: [{ field: "desc", valueJson: JSON.stringify("x".repeat(100_001)) }] },
    { changes: Array.from({ length: 12 }, (_, index) => ({ field: `field-${index}`, valueJson: JSON.stringify("x".repeat(90_000)) })) },
  ]) assert.ok(parseLiveProgramDocumentToolInput({ ...valid, ...changed }) === undefined, "bounded malformed mutation must be rejected without expanding diagnostics");
});
