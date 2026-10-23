import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLosslessJson, stringifyLosslessJson } from "../shared/losslessJson";
import { normalizeProgramWireForDisk } from "../wire/normalizeProgramWireForDisk";
import { createProgramDocumentSession, type ProgramDocumentSession } from "./programDocumentSession";
import { createProgramDocumentSubProgram, deleteProgramDocumentSubProgram, prepareProgramDocumentSubProgramDelete,
  type PreparedSubProgramDelete } from "./programDocumentSubPrograms";

const identity = { documentKey: "fixture/data.json", storage: { key: "fixture/data.json", version: "1" }, projectBinding: null };
const create = (body: Record<string, unknown> = {}) => createProgramDocumentSession({ identity, content: stringifyLosslessJson(body) });
const options = (session: ProgramDocumentSession) => ({ expectedRevision: session.getState().revision, expectedIdentity: session.getState().identity, source: "ui" as const });
const raw = (session: ProgramDocumentSession): any => parseLosslessJson(session.getState().content);
const row = (id: string, name = id, extra: Record<string, unknown> = {}) => ({ id, name, kind: 1, steps: [], variables: [], ...extra });
const call = (value: unknown, extra: Record<string, unknown> = {}) => ({ stepRunnerKey: "sys:subprogram", inputParams: { subProgram: value }, ...extra });
function prepare(session: ProgramDocumentSession, id = "child"): PreparedSubProgramDelete {
  const result = prepareProgramDocumentSubProgramDelete(session, id);
  if (!result.ok) assert.fail(result.error);
  return result.preview;
}

test("empty root creation follows Web names/defaults with caller IDs and one native history entry", () => {
  const session = create({ subPrograms: [row("one", "子程序1"), row("two", "Suggested"), row("nested-owner", "Parent", {
    subPrograms: [row("nested", "子程序2"), row("suggested-two", "Suggested2")],
  })] });
  const initial = session.getState().content;
  const first = createProgramDocumentSubProgram(session, { id: " created " }, options(session));
  assert.equal(first.ok, true);
  if (!first.ok) assert.fail(first.error);
  assert.deepEqual(first.created, { id: "created", name: "子程序3" });
  assert.deepEqual(raw(session).subPrograms.at(-1), { id: "created", name: "子程序3", description: "", icon: "", kind: 1,
    steps: [], variables: [], subPrograms: [], stepCount: 0, variableCount: 0 });
  assert.equal(raw(session).subPrograms[2].subPrograms.length, 2, "creation appends at root, never to the selected nested body");
  assert.equal(session.getState().revision, 1);
  assert.equal(session.getHistoryState().undoDepth, 1);
  const added = session.getState().content;
  session.undo(options(session)); assert.equal(session.getState().content, initial);
  session.redo(options(session)); assert.equal(session.getState().content, added);
  const second = createProgramDocumentSubProgram(session, { id: "suggested", suggestedName: " Suggested " }, options(session));
  assert.equal(second.ok && second.created.name, "Suggested3");
  const caseSensitive = createProgramDocumentSubProgram(session, { id: "case", suggestedName: "suggested" }, options(session));
  assert.equal(caseSensitive.ok && caseSensitive.created.name, "suggested");
});

test("creation rejects invalid, duplicate and foreign-cache IDs or stale owners without clearing redo", () => {
  const session = create({ subPrograms: [row("child"), row("foreign", "Foreign", { kind: 2, subPrograms: [row("cached")] })] });
  assert.equal(createProgramDocumentSubProgram(session, { id: "new" }, options(session)).ok, true);
  session.undo(options(session));
  const before = session.getState();
  for (const id of ["", " ", "child", "cached"]) {
    assert.equal(createProgramDocumentSubProgram(session, { id }, options(session)).ok, false);
  }
  for (const suggestedName of ["%%global", "@@template"]) {
    assert.equal(createProgramDocumentSubProgram(session, { id: "new", suggestedName }, options(session)).ok, false);
  }
  const stale = createProgramDocumentSubProgram(session, { id: "new" }, { ...options(session), expectedRevision: 0 });
  assert.equal(!stale.ok && stale.code, "revision_conflict");
  const foreign = createProgramDocumentSubProgram(session, { id: "new" }, { ...options(session), expectedIdentity: { documentKey: "other" } });
  assert.equal(!foreign.ok && foreign.code, "identity_conflict");
  assert.equal(session.getState(), before); assert.equal(session.getHistoryState().redoDepth, 1);
  const ambiguous = create({ subPrograms: [row("same"), row("owner", "Owner", { subPrograms: [row("same")] })] });
  assert.equal(createProgramDocumentSubProgram(ambiguous, { id: "fresh" }, options(ambiguous)).ok, false);
});

test("create/delete and disk snapshots retain opaque numerics, file bindings and untouched foreign caches", () => {
  const session = create(parseLosslessJson('{"future":9223372036854775807,"decimal":0.123456789012345678901,"steps":[{"key":"future:runner","inputs":{"script.file":"files/script.cs","opaque":1e999}}],"variables":[{"key":"x","default.file":"files/default.txt"}],"subPrograms":[{"id":"child","name":"Child","kind":1e0,"future":9007199254740993,"steps":[]},{"id":"link","name":"Foreign","kind":2,"subPrograms":[{"id":"cache","name":"Cached","steps":[],"future":1e999}]}]}') as Record<string, unknown>);
  const beforeForeign = stringifyLosslessJson(raw(session).subPrograms[1]);
  assert.equal(createProgramDocumentSubProgram(session, { id: "fresh" }, options(session)).ok, true);
  const preview = prepare(session); assert.equal(preview.canDelete, true);
  assert.equal(deleteProgramDocumentSubProgram(session, preview, options(session)).ok, true);
  assert.equal(stringifyLosslessJson(raw(session).subPrograms[0]), beforeForeign);
  const saved = session.beginSave(() => session.readSnapshot());
  if (!saved.ok) assert.fail(saved.error);
  const disk = normalizeProgramWireForDisk(saved.ticket.content);
  for (const lexeme of ["9223372036854775807", "0.123456789012345678901", "1e999"]) assert.ok(disk.includes(lexeme));
  assert.equal(raw(session).variables[0]["default.file"], "files/default.txt");
  assert.equal(raw(session).steps[0].inputs["script.file"], "files/script.cs");
});

test("native case-insensitive stored calls and showText operations block deletion without rewriting inputs", () => {
  const candidates = [
    call("cHiLd"), call({ Value: "CHILD", Future: true }),
    { key: "sys:subprogram", Inputs: { SubProgram: "@value:Child" } },
    call({ value: "Child", varKey: "dynamic" }), // Native usage sees the stored value even with a variable binding.
    { stepRunnerKey: "future:branch", IfSteps: [call("CHILD")], ElseSteps: [] },
    { StepRunnerKey: "sys:showText", InputParams: { operations: { Value: "open:$SP$CHILDsuffix" } } },
  ];
  for (const candidate of candidates) {
    const session = create({ steps: [candidate], subPrograms: [row("child", "Child")] });
    const before = session.getState();
    const preview = prepare(session);
    assert.equal(preview.canDelete, false);
    assert.equal(preview.references.length, 1);
    assert.equal(deleteProgramDocumentSubProgram(session, preview, options(session)).ok, false);
    assert.equal(session.getState(), before);
  }
  const special = create({ steps: [call('$="$$literal"')], subPrograms: [row("child", "$$literal")] });
  assert.equal(prepare(special).canDelete, false, "the properties writer's canonical constant is a known literal");
});

test("unresolved dynamic expressions retain the source boundary and are never evaluated or rewritten", () => {
  const steps = [call("@var:dynamic"), call({ varKey: "dynamic" }), call({ file: "files/name.txt" }),
    call("$=Run()"), call("$$anything"), call("%%Child"), call("@@Child"), call("different")];
  const session = create({ steps, subPrograms: [row("child", "Child")] });
  const preview = prepare(session);
  assert.equal(preview.canDelete, true);
  assert.equal(preview.referenceBoundary, "stored-values-and-show-text-operations");
  assert.equal(deleteProgramDocumentSubProgram(session, preview, options(session)).ok, true);
  assert.deepEqual(raw(session).steps, steps);
});

test("foreign cache targets stay read-only and stored references inside foreign caches are not silently ignored", () => {
  const linked = row("link", "Foreign", { kind: 2, steps: [call("Child")], subPrograms: [row("cached", "Cached")] });
  const session = create({ subPrograms: [row("child", "Child"), linked] });
  const before = session.getState();
  assert.equal(prepareProgramDocumentSubProgramDelete(session, "link").ok, false);
  assert.equal(prepareProgramDocumentSubProgramDelete(session, "cached").ok, false);
  const preview = prepare(session);
  assert.equal(preview.canDelete, false); assert.match(preview.references[0]!.path, /subPrograms\/1\/steps\/0/);
  assert.equal(deleteProgramDocumentSubProgram(session, preview, options(session)).ok, false);
  assert.equal(session.getState(), before);
});

test("a prepared deletion refuses changed revision, complete identity, target fingerprint and newly added references", () => {
  const session = create({ subPrograms: [row("child", "Child")] });
  const preview = prepare(session);
  const preparedState = session.getState();
  assert.equal(preparedState.revision, 0); assert.equal(preparedState.history.undoDepth, 0, "preparation is read-only");
  const copied = { ...preview };
  assert.equal(deleteProgramDocumentSubProgram(session, copied, options(session)).ok, false, "confirmation cannot be forged by copying its public fields");
  assert.equal(session.getState(), preparedState);
  const ticket = session.beginSave(() => session.readSnapshot());
  if (!ticket.ok) assert.fail(ticket.error);
  session.completeSave(ticket.ticket, { ok: true, identity: { ...identity, storage: { ...identity.storage, version: "2" } } });
  const changedIdentity = deleteProgramDocumentSubProgram(session, preview, options(session));
  assert.equal(!changedIdentity.ok && changedIdentity.code, "identity_conflict");
  const fresh = prepare(session);
  session.transact({ ...options(session), source: "agent", update: (document) => { document.steps = [call("Child")]; } });
  const before = session.getState();
  const stale = deleteProgramDocumentSubProgram(session, fresh, options(session));
  assert.equal(!stale.ok && stale.code, "revision_conflict"); assert.equal(session.getState(), before);
  const referenced = prepare(session); assert.equal(referenced.canDelete, false);
  assert.equal(deleteProgramDocumentSubProgram(session, referenced, options(session)).ok, false, "commit rechecks usage even when called directly after a blocked preview");
});

test("missing/ambiguous definitions and wire aliases fail closed; another session cannot accept an old confirmation", () => {
  const session = create({ subPrograms: [row("child", "Child")] });
  for (const id of ["", " ", "missing"]) assert.equal(prepareProgramDocumentSubProgramDelete(session, id).ok, false);
  const duplicate = create({ subPrograms: [row("child"), row("parent", "Parent", { subPrograms: [row("child")] })] });
  assert.equal(prepareProgramDocumentSubProgramDelete(duplicate, "child").ok, false);
  for (const step of [
    { stepRunnerKey: "sys:subprogram", key: "sys:subprogram", inputParams: { subProgram: "Child" } },
    { key: "sys:subprogram", inputParams: { subProgram: "Child" }, inputs: { subProgram: "different" } },
    { stepRunnerKey: "sys:showText", inputs: { operations: "$sp$Child" }, InputParams: { operations: "different" } },
  ]) {
    const ambiguous = create({ steps: [step], subPrograms: [row("child", "Child")] });
    const before = ambiguous.getState();
    assert.equal(prepareProgramDocumentSubProgramDelete(ambiguous, "child").ok, false);
    assert.equal(ambiguous.getState(), before);
  }
  const preview = prepare(session);
  const reopened = create({ subPrograms: [row("child", "Child")] });
  assert.deepEqual(session.getState().identity, reopened.getState().identity);
  const result = deleteProgramDocumentSubProgram(reopened, preview, options(reopened));
  assert.equal(!result.ok && result.code, "identity_conflict"); assert.equal(reopened.getState().history.undoDepth, 0);
});

test("deleting an owned subtree protects externally used descendants and preserves single-entry undo/redo", () => {
  const parent = row("parent", "Parent", { steps: [call("Nested")], subPrograms: [row("nested", "Nested")] });
  const referenced = create({ steps: [call("Nested")], subPrograms: [parent] });
  const blocked = prepare(referenced, "parent"); assert.equal(blocked.canDelete, false); assert.equal(blocked.references[0]?.targetId, "nested");
  const session = create({ subPrograms: [parent, row("other", "Other")] });
  const initial = session.getState().content;
  const preview = prepare(session, "parent");
  assert.equal(preview.canDelete, true, "calls to descendants within the removed body disappear with that body");
  assert.deepEqual(preview.removedIds, ["parent", "nested"]);
  assert.equal(deleteProgramDocumentSubProgram(session, preview, options(session)).ok, true);
  assert.deepEqual(raw(session).subPrograms.map((item: any) => item.id), ["other"]);
  assert.equal(session.getHistoryState().undoDepth, 1); const removed = session.getState().content;
  session.undo(options(session)); assert.equal(session.getState().content, initial);
  session.redo(options(session)); assert.equal(session.getState().content, removed);
  const self = create({ subPrograms: [row("child", "Child", { steps: [call("Child")] })] });
  assert.equal(prepare(self).canDelete, false, "native self-reference refusal remains conservative");
});

test("late save acknowledgement cannot erase a new definition or its document history", () => {
  const session = create();
  const saving = session.beginSave(() => session.readSnapshot());
  if (!saving.ok) assert.fail(saving.error);
  assert.equal(createProgramDocumentSubProgram(session, { id: "child", suggestedName: "Child" }, options(session)).ok, true);
  const working = session.getState().content;
  session.completeSave(saving.ticket, { ok: true });
  assert.equal(session.getState().content, working); assert.equal(session.getState().dirty, true);
  assert.equal(session.getHistoryState().undoDepth, 1);
  const preview = prepare(session); assert.equal(deleteProgramDocumentSubProgram(session, preview, options(session)).ok, true);
  assert.equal(session.getState().dirty, false); assert.equal(session.getHistoryState().undoDepth, 2);
  session.undo(options(session)); assert.equal(session.getState().content, working);
  const closedPreview = prepare(session); session.close();
  const closed = deleteProgramDocumentSubProgram(session, closedPreview, options(session));
  assert.equal(!closed.ok && closed.code, "closed");
});

test("partial body persistence advances only its ticket baseline after a newer deletion", () => {
  const session = create();
  createProgramDocumentSubProgram(session, { id: "child" }, options(session));
  const ticket = session.beginSave(() => session.readSnapshot());
  if (!ticket.ok) assert.fail(ticket.error);
  const preview = prepare(session);
  assert.equal(deleteProgramDocumentSubProgram(session, preview, options(session)).ok, true);
  const removed = session.getState().content;
  const partial = session.completeSave(ticket.ticket, { ok: false, error: "metadata was not persisted", persistedParts: { body: true } });
  assert.equal(partial.ok, false); assert.equal(session.getState().content, removed);
  assert.equal(session.getState().dirty, true); assert.equal(session.getHistoryState().undoDepth, 2);
  session.undo(options(session));
  assert.equal(session.readSnapshot().subPrograms[0]?.id, "child");
  assert.equal(session.getState().dirty, false, "undo restores the body that actually reached disk, without undoing its baseline");
  session.redo(options(session)); assert.equal(session.getState().content, removed); assert.equal(session.getState().dirty, true);
});
