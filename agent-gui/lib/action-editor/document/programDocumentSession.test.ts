import assert from "node:assert/strict";
import { test } from "node:test";
import { createProgramDocumentSession, type ProgramDocumentIdentity } from "./programDocumentSession";

const content = JSON.stringify({ future: { retained: true }, steps: [{ stepRunnerKey: "sys:delay", inputParams: { ms: "10" } }], variables: [] });
const identity: ProgramDocumentIdentity = { documentKey: "fixture/data.json", storage: { key: "fixture/data.json", version: "v1" }, host: { kind: "v1", instanceId: "fixture-instance", actionId: "fixture-action", version: "1" } };
const create = () => createProgramDocumentSession({ content, identity });

test("initial live callback is a clean no-op with stable state and isolated snapshot/identity", () => {
  const session = create();
  const initial = session.getState();
  const snapshot = session.readSnapshot();
  const result = session.applySnapshot(snapshot, { expectedRevision: 0, source: "ui" });
  assert.equal(result.ok, true);
  assert.equal(session.getState(), initial);
  snapshot.steps[0]!.note = "external mutation";
  assert.equal(session.readSnapshot().steps[0]!.note, "");
  assert.equal(initial.content, content);
  assert.equal(initial.dirty, false);
  assert.ok(Object.isFrozen(initial.identity.host));
});

test("human and Agent transactions share revision, identity and unknown native document", () => {
  const session = create();
  const ui = session.readSnapshot();
  ui.steps[0]!.note = "human";
  assert.equal(session.applySnapshot(ui, { expectedRevision: 0, source: "ui" }).ok, true);
  const stale = session.transact({ expectedRevision: 0, source: "agent", update: (draft) => { draft.future = "overwrite"; } });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "revision_conflict");
  const wrongHost = session.transact({ expectedRevision: 1, source: "agent", expectedIdentity: { ...identity, host: { ...identity.host!, instanceId: "other" } }, update: () => {} });
  assert.equal(wrongHost.ok, false);
  if (!wrongHost.ok) assert.equal(wrongHost.code, "identity_conflict");
  assert.equal(session.transact({ expectedRevision: 1, source: "agent", expectedIdentity: identity, update: (draft) => { draft.agentField = { version: 2 }; } }).ok, true);
  const next = session.readSnapshot();
  next.steps[0]!.inputParams.ms!.value = "11";
  assert.equal(session.applySnapshot(next, { expectedRevision: 2, source: "ui" }).ok, true);
  assert.equal(session.getState().revision, 3);
  assert.deepEqual(JSON.parse(session.getState().content).future, { retained: true });
  assert.deepEqual(JSON.parse(session.getState().content).agentField, { version: 2 });
});

test("beginSave reads the live snapshot and a late completion retains newer working edits", () => {
  const session = create();
  const live = session.readSnapshot();
  live.steps[0]!.note = "saved snapshot";
  const started = session.beginSave(() => live);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.equal(started.ticket.revision, 1);
  assert.equal(JSON.parse(started.ticket.content).steps[0].note, "saved snapshot");
  assert.equal(started.state.saving, true);
  const newer = session.readSnapshot();
  newer.steps[0]!.note = "new edit while saving";
  session.applySnapshot(newer, { expectedRevision: 1, source: "ui" });
  const finished = session.completeSave(started.ticket, { ok: true, identity: { ...identity, storage: { key: identity.storage!.key, version: "v2" } } });
  assert.equal(finished.ok, true);
  assert.equal(session.getState().revision, 2);
  assert.equal(session.getState().dirty, true);
  assert.equal(JSON.parse(session.getState().baselineContent).steps[0].note, "saved snapshot");
  assert.equal(JSON.parse(session.getState().content).steps[0].note, "new edit while saving");
  assert.equal(session.getState().identity.storage?.version, "v2");
  const second = session.beginSave(() => session.readSnapshot());
  if (!second.ok) assert.fail(second.error);
  session.completeSave(second.ticket, { ok: true });
  assert.equal(session.getState().dirty, false);
});

test("save tickets are single-flight, session-owned and cannot clear a later save", () => {
  const session = create();
  const first = session.beginSave(() => session.readSnapshot());
  if (!first.ok) assert.fail(first.error);
  let readerCalls = 0;
  const busy = session.beginSave(() => { readerCalls++; return session.readSnapshot(); });
  assert.equal(busy.ok, false);
  assert.equal(readerCalls, 0);
  const other = create();
  const foreign = other.completeSave(first.ticket, { ok: true });
  assert.equal(foreign.ok, false);
  if (!foreign.ok) assert.equal(foreign.code, "stale_save");
  session.completeSave(first.ticket, { ok: true });
  const second = session.beginSave(() => session.readSnapshot());
  if (!second.ok) assert.fail(second.error);
  assert.equal(session.completeSave(first.ticket, { ok: true }).ok, false);
  assert.equal(session.getState().saving, true);
  assert.equal(session.completeSave(second.ticket, { ok: true }).ok, true);
});

test("live save snapshot cannot reenter save or overwrite a transaction committed while it was read", () => {
  const session = create();
  const started = session.beginSave(() => {
    const reentered = session.beginSave(() => session.readSnapshot());
    assert.equal(reentered.ok, false);
    if (!reentered.ok) assert.equal(reentered.code, "save_in_progress");
    return session.readSnapshot();
  });
  if (!started.ok) assert.fail(started.error);
  session.completeSave(started.ticket, { ok: true });
  const staleRead = session.beginSave(() => {
    const stale = session.readSnapshot();
    session.transact({ expectedRevision: 0, source: "agent", update: (draft) => { draft.concurrentAgentEdit = true; } });
    return stale;
  });
  assert.equal(staleRead.ok, false);
  if (!staleRead.ok) assert.equal(staleRead.code, "revision_conflict");
  assert.equal(JSON.parse(session.getState().content).concurrentAgentEdit, true);
  assert.equal(session.getState().saving, false);
});

test("failed, partial and wrong-target saves never advance baseline or overwrite the working document", () => {
  const session = create();
  const snapshot = session.readSnapshot();
  snapshot.steps[0]!.note = "draft";
  session.applySnapshot(snapshot, { expectedRevision: 0, source: "ui" });
  const first = session.beginSave(() => session.readSnapshot());
  if (!first.ok) assert.fail(first.error);
  const failure = session.completeSave(first.ticket, { ok: false, persisted: true, error: "checkpoint failed; inspect host" });
  assert.equal(failure.ok, false);
  if (!failure.ok) assert.equal(failure.persisted, true);
  assert.equal(session.getState().baselineContent, content);
  assert.equal(session.getState().dirty, true);
  const second = session.beginSave(() => session.readSnapshot());
  if (!second.ok) assert.fail(second.error);
  const wrongTarget = session.completeSave(second.ticket, { ok: true, identity: { ...identity, host: { ...identity.host!, instanceId: "restarted-instance" } } });
  assert.equal(wrongTarget.ok, false);
  if (!wrongTarget.ok) assert.equal(wrongTarget.code, "identity_conflict");
  assert.equal(session.getState().baselineContent, content);
  assert.equal(session.readSnapshot().steps[0]!.note, "draft");
});

test("raw transaction rejects invalid documents, copied references and reentrant stale updates", () => {
  const session = create();
  const invalid = session.transact({ expectedRevision: 0, source: "agent", update: (draft) => { draft.steps = "invalid"; } });
  assert.equal(invalid.ok, false);
  assert.equal(session.getState().revision, 0);
  let leaked: Record<string, unknown> | undefined;
  session.transact({ expectedRevision: 0, source: "agent", update: (draft) => { leaked = draft; draft.revisionMarker = 1; } });
  leaked!.revisionMarker = 9;
  assert.equal(JSON.parse(session.getState().content).revisionMarker, 1);
  const outer = session.transact({ expectedRevision: 1, source: "agent", update: (draft) => {
    session.transact({ expectedRevision: 1, source: "agent", update: (inner) => { inner.revisionMarker = 2; } });
    draft.revisionMarker = 3;
  } });
  assert.equal(outer.ok, false);
  if (!outer.ok) assert.equal(outer.code, "revision_conflict");
  assert.equal(JSON.parse(session.getState().content).revisionMarker, 2);
});

test("semantic undo returns clean while revisions stay monotonic; closing rejects pending completions", () => {
  const session = create();
  session.transact({ expectedRevision: 0, source: "ui", update: (draft) => { draft.extra = true; } });
  session.transact({ expectedRevision: 1, source: "ui", update: (draft) => { delete draft.extra; } });
  assert.equal(session.getState().dirty, false);
  assert.equal(session.getState().revision, 2);
  const started = session.beginSave(() => session.readSnapshot());
  if (!started.ok) assert.fail(started.error);
  session.close();
  assert.equal(session.completeSave(started.ticket, { ok: true }).ok, false);
  assert.equal(session.transact({ expectedRevision: 2, source: "agent", update: () => {} }).ok, false);
  assert.equal(session.getState().saving, false);
});

test("visual undo to a baseline without persisted ids or with legacy defaults returns clean", () => {
  const original = JSON.stringify({ steps: [{ stepRunnerKey: "sys:delay", future: true }], variables: [{ key: "text", defaultValue: "original" }], subPrograms: [{ id: "sub", stepCount: 99, steps: [{ stepRunnerKey: "sys:delay" }] }] });
  const session = createProgramDocumentSession({ content: original, identity });
  const baseline = session.readSnapshot();
  const changed = structuredClone(baseline);
  changed.steps[0]!.note = "edited";
  changed.variables[0]!.defaultValue = "changed";
  changed.subPrograms[0]!.steps[0]!.note = "sub edited";
  session.applySnapshot(changed, { expectedRevision: 0, source: "ui" });
  assert.equal(session.getState().dirty, true);
  session.applySnapshot(baseline, { expectedRevision: 1, source: "ui" });
  assert.equal(session.getState().revision, 2);
  assert.equal(session.getState().dirty, false);
  assert.equal(session.getState().baselineContent, original);
  assert.equal(JSON.parse(session.getState().content).steps[0].future, true);
});

test("Agent opaque nested table fields remain part of the native revision and dirty comparison", () => {
  const session = createProgramDocumentSession({ content: JSON.stringify({ steps: [], variables: [{ id: "v", key: "table", tableDef: { fields: [{ fieldKey: "col", futureField: 1 }] } }] }), identity });
  const changed = session.transact({ expectedRevision: 0, source: "agent", update: (draft) => {
    const vars = draft.variables as Array<{ tableDef: { fields: Array<{ futureField: number }> } }>;
    vars[0]!.tableDef.fields[0]!.futureField = 2;
  } });
  assert.equal(changed.ok, true);
  assert.equal(session.getState().revision, 1);
  assert.equal(session.getState().dirty, true);
  assert.equal(JSON.parse(session.getState().content).variables[0].tableDef.fields[0].futureField, 2);
});

test("opaque default object changes participate in the same native revision", () => {
  const session = createProgramDocumentSession({ content: JSON.stringify({ steps: [], variables: [{ id: "v", key: "text", defaultValue: { file: "files/a.txt", futureDefault: { x: 1 } } }] }), identity });
  const result = session.transact({ expectedRevision: 0, source: "agent", update: (draft) => {
    const vars = draft.variables as Array<{ defaultValue: { futureDefault: { x: number } } }>;
    vars[0]!.defaultValue.futureDefault.x = 2;
  } });
  assert.equal(result.ok, true);
  assert.equal(session.getState().revision, 1);
  assert.equal(session.getState().dirty, true);
  assert.equal(JSON.parse(session.getState().content).variables[0].defaultValue.futureDefault.x, 2);
});

test("save acknowledgement recognizes only the baseline or pending native snapshot while newer edits remain live", () => {
  const session = create();
  assert.equal(session.isSaveAcknowledgement(content), true);
  assert.equal(session.isSaveAcknowledgement(JSON.stringify(JSON.parse(content), null, 4)), true);
  const a = session.readSnapshot();
  a.steps[0]!.note = "saved A";
  session.applySnapshot(a, { expectedRevision: 0, source: "ui" });
  const started = session.beginSave(() => session.readSnapshot());
  if (!started.ok) assert.fail(started.error);
  const b = session.readSnapshot();
  b.steps[0]!.note = "new working B";
  session.applySnapshot(b, { expectedRevision: 1, source: "ui" });
  const current = session.getState();
  assert.equal(session.isSaveAcknowledgement(content), true);
  assert.equal(session.isSaveAcknowledgement(started.ticket.content), true);
  assert.equal(session.isSaveAcknowledgement(current.content), false);
  const remoteC = JSON.parse(started.ticket.content);
  remoteC.future.retained = "unknown native field changed remotely";
  assert.equal(session.isSaveAcknowledgement(JSON.stringify(remoteC)), false);
  assert.equal(session.isSaveAcknowledgement("invalid JSON"), false);
  assert.equal(session.isSaveAcknowledgement("[]"), false);
  assert.equal(session.getState(), current);
  session.completeSave(started.ticket, { ok: false, error: "failed A" });
  assert.equal(session.isSaveAcknowledgement(started.ticket.content), false);
  assert.equal(session.isSaveAcknowledgement(content), true);
  session.close();
  assert.equal(session.isSaveAcknowledgement(content), false);
});

test("successful late A becomes the acknowledged baseline while newer working B stays dirty", () => {
  const session = create();
  const a = session.readSnapshot();
  a.steps[0]!.note = "saved A";
  const started = session.beginSave(() => a);
  if (!started.ok) assert.fail(started.error);
  const b = session.readSnapshot();
  b.steps[0]!.note = "new working B";
  session.applySnapshot(b, { expectedRevision: 1, source: "agent" });
  const workingB = session.getState().content;
  session.completeSave(started.ticket, { ok: true });
  assert.equal(session.isSaveAcknowledgement(started.ticket.content), true);
  assert.equal(session.isSaveAcknowledgement(workingB), false);
  assert.equal(session.isSaveAcknowledgement(content), false);
  assert.equal(session.getState().content, workingB);
  assert.equal(session.getState().dirty, true);
});

test("every opaque default alias participates in acknowledgement, native revision and dirty comparisons", () => {
  for (const alias of ["defaultValue", "default", "DefaultValue", "default_value"]) {
    const content = JSON.stringify({ steps: [], variables: [{ id: "v", key: "text", [alias]: { futureDefault: { x: 1 } } }] });
    const session = createProgramDocumentSession({ content, identity });
    const remote = JSON.parse(content);
    remote.variables[0][alias].futureDefault.x = 2;
    assert.equal(session.isSaveAcknowledgement(JSON.stringify(remote)), false, alias);
    const changed = session.transact({ expectedRevision: 0, source: "agent", update: (draft) => {
      const vars = draft.variables as Array<Record<string, { futureDefault: { x: number } }>>;
      vars[0]![alias]!.futureDefault.x = 2;
    } });
    assert.equal(changed.ok, true, alias);
    if (changed.ok) assert.equal(changed.changed, true, alias);
    assert.equal(session.getState().revision, 1, alias);
    assert.equal(session.getState().dirty, true, alias);
    assert.equal(JSON.parse(session.getState().content).variables[0][alias].futureDefault.x, 2, alias);
    session.close();
  }
});

test("an opaque canonical default collision fails closed without changing revision or starting a save", () => {
  const session = createProgramDocumentSession({ content: JSON.stringify({ steps: [], variables: [{ id: "v", key: "text", default: { futureDefault: { x: 1 } } }] }), identity });
  const initial = session.getState();
  const snapshot = session.readSnapshot();
  snapshot.variables[0]!.defaultValue = "inline conflicts with opaque object";
  const edited = session.applySnapshot(snapshot, { expectedRevision: 0, source: "ui" });
  assert.equal(edited.ok, false);
  if (!edited.ok) assert.equal(edited.code, "invalid_document");
  assert.equal(session.getState(), initial);
  const save = session.beginSave(() => snapshot);
  assert.equal(save.ok, false);
  assert.equal(session.getState().saving, false);
  assert.equal(session.getState().revision, 0);
  assert.deepEqual(JSON.parse(session.getState().content).variables[0].default, { futureDefault: { x: 1 } });
});
