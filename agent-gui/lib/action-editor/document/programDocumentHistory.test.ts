import assert from "node:assert/strict";
import { test } from "node:test";
import { createProgramDocumentSession, type ProgramDocumentHistoryOptions, type ProgramDocumentSession } from "./programDocumentSession";
import { PROGRAM_DOCUMENT_HISTORY_MAX } from "./programDocumentHistory";

const content = '{"future":9223372036854775807,"precise":0.12345678901234567890123456789,"exponent":1e999,"steps":[{"stepId":"main","stepRunnerKey":"sys:fixture","note":"original","inputParams":{"subProgram":"Child"},"futureStep":9007199254740993}],"variables":[{"id":"main-var","key":"main","default.file":"files/default.txt"}],"subPrograms":[{"id":"child","name":"Child","kind":1,"steps":[{"stepId":"child-step","stepRunnerKey":"sys:fixture","note":"child original"}],"variables":[{"id":"child-var","key":"child"}],"futureSub":9007199254740993,"subPrograms":[{"id":"nested","name":"Nested","kind":1,"steps":[],"variables":[],"futureNested":1e999}]}]}';
const metadata = { path: "fixture/info.json", content: '{"ID":"fixture","EditVersion":9223372036854775807,"Title":"Original","Description":"description","Icon":"icon:original","future":0.12345678901234567890123456789}' };
const identity = { documentKey: "fixture/data.json", storage: { key: "fixture/data.json", version: "1" }, projectBinding: null };
const create = (attached = true) => createProgramDocumentSession({ content, identity, ...(attached ? { metadata } : {}) });
const options = (session: ProgramDocumentSession): ProgramDocumentHistoryOptions => ({ expectedRevision: session.getState().revision, expectedIdentity: session.getState().identity, source: "ui" });
const startSave = (session: ProgramDocumentSession) => {
  const started = session.beginSave(() => session.readSnapshot());
  if (!started.ok) assert.fail(started.error);
  return started.ticket;
};
function note(session: ProgramDocumentSession, value: string) {
  const body = session.readSnapshot(); body.steps[0]!.note = value;
  assert.equal(session.applySnapshot(body, options(session)).ok, true);
}

test("all native surfaces and metadata form one atomic undo entry and retain opaque JSON lexemes", () => {
  const session = create();
  const initial = session.getState();
  assert.deepEqual(initial.history, { canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0 });
  const result = session.transactDocument({ ...options(session), update: (draft) => {
    const body = draft.body as any;
    body.steps[0].note = "main changed";
    body.variables[0].key = "main renamed";
    body.subPrograms[0].name = "Child renamed";
    body.steps[0].inputParams.subProgram = "Child renamed";
    body.subPrograms[0].steps[0].note = "child changed";
    body.subPrograms[0].variables[0].key = "child renamed";
    body.subPrograms[0].subPrograms[0].description = "nested changed";
    draft.metadata!.title = "New title";
    draft.metadata!.icon = "icon:new";
  } });
  assert.equal(result.ok, true);
  assert.equal(session.getState().revision, 1);
  assert.equal(session.getHistoryState().undoDepth, 1);
  const edited = session.getState();
  assert.match(edited.content, /9223372036854775807/);
  assert.match(edited.content, /0\.12345678901234567890123456789/);
  assert.match(edited.content, /9007199254740993/);
  assert.match(edited.content, /1e999/);
  assert.match(edited.content, /"default.file": "files\/default.txt"/);
  assert.equal(session.undo(options(session)).ok, true);
  assert.equal(session.getState().content, content, "restore the actual native text, not a regenerated typed DTO");
  assert.equal(session.readMetadata()?.title, "Original");
  assert.equal(session.getState().dirty, false);
  assert.equal(session.getState().revision, 2, "undo is a new document revision");
  assert.equal(session.redo(options(session)).ok, true);
  assert.equal(session.getState().content, edited.content);
  assert.equal(session.readMetadata()?.title, "New title");
  assert.equal(session.getState().revision, 3);
  assert.equal(session.getHistoryState().redoDepth, 0);
  assert.match(session.getState().metadata!.content, /"EditVersion":9223372036854775807/);
});

test("existing body, metadata and Agent edits enter the same timeline; no-op/rejected edits retain redo", () => {
  const session = create();
  note(session, "body");
  assert.equal(session.applyMetadata({ description: "meta" }, options(session)).ok, true);
  assert.equal(session.transact({ ...options(session), source: "agent", update: (draft) => { draft.agent = true; } }).ok, true);
  assert.equal(session.getHistoryState().undoDepth, 3);
  session.undo(options(session));
  assert.equal(JSON.parse(session.getState().content).agent, undefined);
  session.undo(options(session));
  assert.equal(session.readMetadata()?.description, "description");
  assert.equal(session.readSnapshot().steps[0]!.note, "body");
  const current = session.getState();
  const unchanged = session.applySnapshot(session.readSnapshot(), options(session));
  assert.equal(unchanged.ok && unchanged.changed, false);
  assert.equal(session.getState(), current);
  assert.equal(session.transactDocument({ ...options(session), expectedRevision: 0, update: () => assert.fail("stale updater ran") }).ok, false);
  assert.equal(session.getHistoryState().redoDepth, 2);
  note(session, "new branch");
  assert.equal(session.getHistoryState().canRedo, false);
  session.undo(options(session)); session.undo(options(session));
  assert.equal(session.getState().dirty, false);
});

test("metadata-only atomic edits leave native body text untouched", () => {
  const session = create();
  session.transactDocument({ ...options(session), update: (draft) => { draft.metadata!.description = "only metadata"; } });
  assert.equal(session.getState().content, content);
  assert.equal(session.getState().bodyDirty, false);
  assert.equal(session.getHistoryState().undoDepth, 1);
  session.undo(options(session));
  assert.equal(session.getState().content, content);
  assert.equal(session.getState().dirty, false);
});

test("undo/redo enforce the current revision and full identity, never restore saved identity versions", () => {
  const session = create(); note(session, "saved");
  const ticket = startSave(session);
  const savedIdentity = { ...identity, storage: { ...identity.storage, version: "2" } };
  session.completeSave(ticket, { ok: true, identity: savedIdentity });
  const current = session.getState();
  const stale = session.undo({ ...options(session), expectedRevision: 0 });
  assert.equal(!stale.ok && stale.code, "revision_conflict");
  for (const expectedIdentity of [identity, { ...savedIdentity, projectBinding: undefined },
    { ...savedIdentity, storage: { ...savedIdentity.storage, key: "foreign" } }]) {
    const rejected = session.undo({ ...options(session), expectedIdentity });
    assert.equal(!rejected.ok && rejected.code, "identity_conflict");
    assert.equal(session.getState(), current);
  }
  session.undo(options(session));
  assert.deepEqual(session.getState().identity, savedIdentity);
  assert.equal(session.getState().baselineContent, ticket.content);
  assert.equal(session.getState().dirty, true);
  session.redo(options(session));
  assert.equal(session.getState().dirty, false);
  assert.deepEqual(session.getState().identity, savedIdentity);
});

test("bound history requires the exact complete current target and an explicit identity", () => {
  const projectBinding = { schemaVersion: 1 as const, kind: "action" as const, actionId: "11111111-1111-4111-8111-111111111111", hostBinding: {
    hostInstanceId: "fixture", hostSessionId: "a".repeat(32), endpoint: `QuickerRpc_User_${"B".repeat(24)}_${"a".repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: "v1" as const, quickerVersion: "fixture", capabilities: { read: true }, future: { owner: "a" },
  } };
  const session = createProgramDocumentSession({ content, identity: { ...identity, projectBinding } });
  note(session, "bound edit");
  const state = session.getState();
  const omitted = session.undo({ expectedRevision: state.revision, source: "ui" } as ProgramDocumentHistoryOptions);
  assert.equal(!omitted.ok && omitted.code, "identity_conflict");
  const other = structuredClone(state.identity);
  other.projectBinding!.hostBinding.future = { owner: "b" };
  const rejected = session.undo({ ...options(session), expectedIdentity: other });
  assert.equal(!rejected.ok && rejected.code, "identity_conflict");
  assert.equal(session.getState(), state);
  assert.equal(session.getHistoryState().undoDepth, 1);
  assert.equal(session.undo(options(session)).ok, true);
  assert.deepEqual(session.getState().identity.projectBinding, projectBinding);
});

test("late and partial save acknowledgements advance only ticket baselines while undo remains a draft edit", () => {
  for (const part of ["body", "metadata"] as const) {
    const session = create();
    session.transactDocument({ ...options(session), update: (draft) => { (draft.body.steps as any)[0].note = "A"; draft.metadata!.title = "A"; } });
    const ticket = startSave(session);
    session.transactDocument({ ...options(session), update: (draft) => { (draft.body.steps as any)[0].note = "B"; draft.metadata!.title = "B"; } });
    session.undo(options(session));
    assert.equal(session.getState().saving, true);
    const outcome = session.completeSave(ticket, { ok: false, error: "partial", persistedParts: { [part]: true } });
    assert.equal(outcome.ok, false);
    assert.equal(session.getState().bodyDirty, part !== "body");
    assert.equal(session.getState().metadata!.dirty, part !== "metadata");
    assert.equal(session.getHistoryState().redoDepth, 1);
    session.redo(options(session));
    assert.equal(session.readSnapshot().steps[0]!.note, "B");
    assert.equal(session.readMetadata()!.title, "B");
    assert.equal(session.getState().bodyDirty, true);
    assert.equal(session.getState().metadata!.dirty, true);
    session.undo(options(session));
    session.undo(options(session));
    assert.equal(session.getState().bodyDirty, part === "body");
    assert.equal(session.getState().metadata!.dirty, part === "metadata");
  }
  const session = create(); note(session, "A"); const ticket = startSave(session); note(session, "B");
  session.completeSave(ticket, { ok: true });
  assert.equal(session.getState().dirty, true);
  session.undo(options(session));
  assert.equal(session.getState().dirty, false, "undo to the late confirmed A is clean");
  session.undo(options(session));
  assert.equal(session.getState().dirty, true, "undo before the saved baseline is a local unsaved change");
});

test("metadata/binding attachment and version-only refresh preserve body history; external fields cannot be undone", () => {
  const session = create(false); note(session, "first body");
  session.reconcileMetadataSource(metadata);
  session.reconcileProjectBinding(null);
  assert.equal(session.getHistoryState().undoDepth, 1);
  session.undo(options(session));
  assert.equal(session.getState().content, content);
  assert.equal(session.readMetadata()!.title, "Original", "undo cannot detach an asynchronously attached source");
  session.redo(options(session));
  const ticket = startSave(session); session.completeSave(ticket, { ok: true });
  const stamped = metadata.content.replace("9223372036854775807", "9223372036854775806");
  session.reconcileMetadataSource({ ...metadata, content: stamped });
  session.applyMetadata({ description: "local property history" }, options(session));
  session.undo(options(session));
  assert.match(session.getState().metadata!.content, /"EditVersion":9223372036854775806/);
  const incoming = stamped.replace('"Original"', '"Remote title"');
  assert.equal(session.reconcileMetadataSource({ ...metadata, content: incoming }).ok, true);
  session.redo(options(session));
  assert.equal(session.readMetadata()!.description, "local property history");
  assert.equal(session.readMetadata()!.title, "Remote title", "only the accepted external title field rebases the timeline");
  session.undo(options(session)); session.undo(options(session));
  assert.equal(session.getState().content, content);
  assert.equal(session.readMetadata()!.title, "Remote title");
  assert.match(session.getState().metadata!.content, /"EditVersion":9223372036854775806/);
  assert.match(session.getState().metadata!.content, /0\.12345678901234567890123456789/);
});

test("invalid/reentrant transactions and external conflicts do not consume history; reload/closed owners reject old work", () => {
  const session = create(); note(session, "local");
  const before = session.getState();
  const invalid = session.transactDocument({ ...options(session), update: (draft) => { draft.body.steps = "bad"; draft.metadata!.title = "must not commit"; } });
  assert.equal(invalid.ok, false); assert.equal(session.getState(), before);
  const asynchronous = session.transactDocument({ ...options(session), update: async () => {} });
  assert.equal(!asynchronous.ok && asynchronous.code, "invalid_document");
  assert.equal(session.getState(), before);
  const result = session.transactDocument({ ...options(session), update: (draft) => {
    session.applyMetadata({ icon: "inner" }, options(session)); draft.metadata!.title = "outer";
  } });
  assert.equal(!result.ok && result.code, "revision_conflict");
  assert.equal(session.readMetadata()!.title, "Original");
  assert.equal(session.readMetadata()!.icon, "inner");
  const conflictState = session.getState();
  const conflict = session.reconcileMetadataSource({ ...metadata, content: metadata.content.replace('"Original"', '"Foreign"') });
  assert.equal(!conflict.ok && conflict.code, "metadata_conflict");
  assert.equal(session.getState(), conflictState);
  const ticket = startSave(session);
  const reloaded = create();
  assert.equal(reloaded.getHistoryState().canUndo, false);
  assert.equal(reloaded.completeSave(ticket, { ok: true }).ok, false);
  session.close();
  assert.equal(session.getHistoryState().canUndo, false);
  assert.equal(!session.undo(options(session)).ok, true);
  assert.equal(!session.redo(options(session)).ok, true);
});

test("history is bounded and returned state is immutable without exposing mutable stored snapshots", () => {
  const session = create();
  for (let index = 0; index < PROGRAM_DOCUMENT_HISTORY_MAX + 5; index += 1) note(session, String(index));
  assert.equal(session.getHistoryState().undoDepth, PROGRAM_DOCUMENT_HISTORY_MAX);
  assert.ok(Object.isFrozen(session.getHistoryState()));
  for (let index = 0; index < PROGRAM_DOCUMENT_HISTORY_MAX + 5; index += 1) session.undo(options(session));
  assert.equal(session.getHistoryState().canUndo, false);
  assert.equal(session.readSnapshot().steps[0]!.note, "4");
  assert.equal(session.getState().dirty, true);
});
