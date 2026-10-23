import assert from "node:assert/strict";
import { test } from "node:test";
import { createProgramDocumentSession, type ProgramDocumentSession } from "./programDocumentSession";

const content = '{"steps":[],"variables":[],"native":{"retained":true}}';
const metadata = { path: "fixture/info.json", content: '{"ID":"native","EditVersion":"42","Title":"Original","Description":" raw ","Icon":"fa:old","Future":{"x":1}}' };
const create = (attached = true) => createProgramDocumentSession({ content, identity: { documentKey: "fixture/data.json" }, ...(attached ? { metadata } : {}) });
const editBody = (session: ProgramDocumentSession, value: number) => session.transact({ expectedRevision: session.getState().revision, source: "agent", update: (draft) => { draft.edit = value; } });
const editMeta = (session: ProgramDocumentSession, title: string) => session.applyMetadata({ title }, { expectedRevision: session.getState().revision, source: "ui" });
const begin = (session: ProgramDocumentSession) => {
  const result = session.beginSave(() => session.readSnapshot());
  if (!result.ok) assert.fail(result.error);
  return result.ticket;
};

test("metadata attach preserves body draft, shares revision and never invents a host identity", () => {
  const session = create(false);
  assert.equal(session.readMetadata(), null);
  editBody(session, 1);
  const body = session.getState().content;
  assert.equal(session.reconcileMetadataSource(metadata).ok, true);
  assert.equal(session.getState().revision, 2);
  assert.equal(session.getState().content, body);
  assert.equal(session.getState().bodyDirty, true);
  assert.equal(session.getState().metadata?.dirty, false);
  assert.equal(session.getState().dirty, true);
  assert.equal(session.getState().identity.host, undefined);
  assert.deepEqual(session.readMetadata(), { title: "Original", description: " raw ", icon: "fa:old" });
  assert.ok(Object.isFrozen(session.getState().metadata));
  const state = session.getState();
  const stale = session.applyMetadata({ title: "stale" }, { expectedRevision: 1, source: "ui" });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.code, "revision_conflict");
  const wrong = session.reconcileMetadataSource({ ...metadata, path: "other/info.json" });
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.code, "identity_conflict");
  assert.equal(session.getState(), state);
});

test("metadata drafts allow temporary empty title, but save validates the current text", () => {
  const session = create();
  assert.equal(editMeta(session, "").ok, true);
  assert.equal(session.readMetadata()?.title, "");
  assert.equal(session.getState().revision, 1);
  assert.equal(session.getState().bodyDirty, false);
  assert.equal(session.getState().dirty, true);
  const invalid = session.beginSave(() => session.readSnapshot());
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.code, "invalid_document");
  assert.equal(session.getState().saving, false);
  editMeta(session, "  Valid  ");
  const ticket = begin(session);
  assert.equal(JSON.parse(ticket.metadata!.content).Title, "  Valid  ");
  assert.equal(ticket.baselineContent, content);
  assert.equal(ticket.metadata!.baselineContent, metadata.content);
  assert.ok(Object.isFrozen(ticket.metadata));
  session.completeSave(ticket, { ok: true });
  assert.equal(session.readMetadata()?.title, "  Valid  ");
  assert.equal(session.getState().dirty, false);
});

test("metadata source acknowledgement recognizes baseline and pending A, never overwrites newer B", () => {
  const session = create();
  editBody(session, 1);
  editMeta(session, "A");
  const ticket = begin(session);
  editBody(session, 2);
  editMeta(session, "B");
  const working = session.getState();
  assert.equal(session.reconcileMetadataSource(metadata).ok, true);
  assert.equal(session.reconcileMetadataSource(ticket.metadata!).ok, true);
  assert.equal(session.getState(), working);
  const remote = { ...metadata, content: ticket.metadata!.content.replace('"x":1', '"x":2') };
  const conflict = session.reconcileMetadataSource(remote);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.code, "metadata_conflict");
  assert.equal(session.getState(), working);
  session.completeSave(ticket, { ok: true });
  assert.equal(session.readMetadata()?.title, "B");
  assert.equal(JSON.parse(session.getState().metadata!.baselineContent).Title, "A");
  assert.equal(JSON.parse(session.getState().baselineContent).edit, 1);
  assert.equal(JSON.parse(session.getState().content).edit, 2);
  assert.equal(session.getState().metadata?.dirty, true);
  assert.equal(session.getState().bodyDirty, true);
});

test("failed pending metadata is not an acknowledgement and clean remote metadata preserves a body draft", () => {
  const session = create();
  editMeta(session, "failed A");
  const ticket = begin(session);
  session.completeSave(ticket, { ok: false, error: "CAS failed" });
  const late = session.reconcileMetadataSource(ticket.metadata!);
  assert.equal(late.ok, false);
  if (!late.ok) assert.equal(late.code, "metadata_conflict");
  editMeta(session, "Original");
  assert.equal(session.getState().metadata?.dirty, false);
  editBody(session, 1);
  const body = session.getState().content;
  const remote = metadata.content.replace('"Original"', '"Remote"');
  const accepted = session.reconcileMetadataSource({ ...metadata, content: remote });
  assert.equal(accepted.ok, true);
  assert.equal(session.readMetadata()?.title, "Remote");
  assert.equal(session.getState().metadata?.baselineContent, remote);
  assert.equal(session.getState().content, body);
  assert.equal(session.getState().dirty, true);
});

test("partial persistence advances only explicit ticket parts and leaves newer edits dirty", () => {
  for (const persistedPart of ["body", "metadata"] as const) {
    const session = create();
    editBody(session, 1);
    editMeta(session, "saved A");
    const ticket = begin(session);
    editBody(session, 2);
    editMeta(session, "new B");
    const outcome = session.completeSave(ticket, { ok: false, error: "second file failed", persistedParts: { [persistedPart]: true } });
    assert.equal(outcome.ok, false);
    if (!outcome.ok) assert.deepEqual(outcome.persistedParts, { [persistedPart]: true });
    assert.equal(session.getState().baselineContent, persistedPart === "body" ? ticket.content : content);
    assert.equal(session.getState().metadata?.baselineContent, persistedPart === "metadata" ? ticket.metadata!.content : metadata.content);
    assert.equal(session.readMetadata()?.title, "new B");
    assert.equal(JSON.parse(session.getState().content).edit, 2);
    assert.equal(session.getState().dirty, true);
    assert.equal(session.getState().saving, false);
    const acknowledgement = session.reconcileMetadataSource(persistedPart === "metadata" ? ticket.metadata! : metadata);
    assert.equal(acknowledgement.ok, true);
    if (acknowledgement.ok) assert.equal(acknowledgement.changed, false);
    assert.equal(session.readMetadata()?.title, "new B");
    assert.equal(session.isSaveAcknowledgement(persistedPart === "body" ? ticket.content : content), true);
    const second = begin(session);
    assert.equal(second.baselineContent, session.getState().baselineContent);
    assert.equal(second.metadata!.baselineContent, session.getState().metadata?.baselineContent);
    session.completeSave(second, { ok: true });
    assert.equal(session.getState().dirty, false);
  }
});

test("only known saved parts become clean; legacy persisted and foreign tickets cannot clear either draft", () => {
  const session = create();
  editBody(session, 1);
  editMeta(session, "A");
  const ticket = begin(session);
  const other = create();
  assert.equal(other.completeSave(ticket, { ok: false, persistedParts: { body: true, metadata: true } }).ok, false);
  session.completeSave(ticket, { ok: false, persisted: true, error: "unknown partial persistence" });
  assert.equal(session.getState().baselineContent, content);
  assert.equal(session.getState().metadata?.baselineContent, metadata.content);
  const next = begin(session);
  session.completeSave(next, { ok: false, persistedParts: { body: true, metadata: false } });
  assert.equal(session.getState().bodyDirty, false);
  assert.equal(session.getState().metadata?.dirty, true);
  assert.equal(session.getState().dirty, true);
  session.close();
  assert.equal(session.reconcileMetadataSource(metadata).ok, false);
  assert.equal(editMeta(session, "closed").ok, false);
});

test("metadata updater in a live reader invalidates its earlier body revision rather than losing either edit", () => {
  const session = create();
  const result = session.beginSave(() => {
    const oldBody = session.readSnapshot();
    editMeta(session, "concurrent metadata");
    return oldBody;
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "revision_conflict");
  assert.equal(session.readMetadata()?.title, "concurrent metadata");
  assert.equal(session.getState().saving, false);
});

test("first metadata attach during a body-only pending save cannot join or be cleared by its older ticket", () => {
  const session = create(false);
  editBody(session, 1);
  const ticket = begin(session);
  assert.equal(ticket.metadata, undefined);
  const attached = session.reconcileMetadataSource(metadata);
  assert.equal(attached.ok, true);
  editMeta(session, "new metadata draft");
  const draft = session.getState();
  session.completeSave(ticket, { ok: true });
  assert.equal(session.getState().baselineContent, ticket.content);
  assert.equal(session.getState().metadata?.baselineContent, metadata.content);
  assert.equal(session.getState().metadata?.content, draft.metadata?.content);
  assert.equal(session.getState().bodyDirty, false);
  assert.equal(session.getState().metadata?.dirty, true);
  assert.equal(session.getState().dirty, true);
  assert.equal(session.getState().revision, draft.revision);
});

test("empty metadata title rejects save without discarding the current live body projection", () => {
  const session = createProgramDocumentSession({ content: '{"steps":[{"stepRunnerKey":"sys:delay"}],"variables":[]}', identity: { documentKey: "fixture/data.json" }, metadata });
  editMeta(session, "  ");
  const live = session.readSnapshot();
  live.steps[0]!.note = "latest editor text not yet rendered";
  const saved = session.beginSave(() => live);
  assert.equal(saved.ok, false);
  if (!saved.ok) assert.match(saved.error, /title cannot be empty/);
  assert.equal(session.readSnapshot().steps[0]!.note, "latest editor text not yet rendered");
  assert.equal(session.readMetadata()?.title, "  ");
  assert.equal(session.getState().bodyDirty, true);
  assert.equal(session.getState().metadata?.dirty, true);
  assert.equal(session.getState().saving, false);
  editMeta(session, "Fixed");
  const ticket = begin(session);
  assert.equal(JSON.parse(ticket.content).steps[0].note, "latest editor text not yet rendered");
});
