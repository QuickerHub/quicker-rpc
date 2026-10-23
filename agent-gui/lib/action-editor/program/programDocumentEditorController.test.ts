import assert from "node:assert/strict";
import test from "node:test";
import { createProgramDocumentSession } from "../document/programDocumentSession";
import { createProgramDocumentEditorController } from "./programDocumentEditorController";

const content = '{"steps":[{"stepId":"main","stepRunnerKey":"future","note":"main","opaque":9223372036854775807}],"variables":[],"subPrograms":[{"id":"child","name":"Child","kind":1,"steps":[],"variables":[],"subPrograms":[{"id":"nested","name":"Nested","kind":1,"steps":[{"stepId":"nested-step","stepRunnerKey":"future","note":"nested","opaque":0.12345678901234567890123456789}],"variables":[],"subPrograms":[]}]}],"opaque":1e999}';

test("surface handles read one session immediately and share history with properties and unopened subtrees", () => {
  const session = createProgramDocumentSession({ content, identity: { documentKey: "one", projectBinding: null },
    metadata: { path: "info.json", content: '{"title":"Original","description":"","icon":"","EditVersion":9223372036854775807}' } });
  const results: unknown[] = [];
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange: (result) => results.push(result) });
  const main = controller.getSurface("main");
  const nested = controller.getSurface("sub-nested");
  assert.equal(controller.getSurface("main"), main);
  const first = main.getPresent(); first.steps[0]!.note = "main edit"; main.commit(first);
  assert.equal(main.getPresent().steps[0]!.note, "main edit");
  const second = nested.getPresent(); second.steps[0]!.note = "nested edit"; nested.commit(second);
  session.applyMetadata({ title: "New title" }, { expectedRevision: session.getState().revision, source: "ui" });
  assert.equal(controller.getHistoryState().undoDepth, 3);
  controller.undo(); assert.equal(session.readMetadata()!.title, "Original");
  controller.undo(); assert.equal(nested.getPresent().steps[0]!.note, "nested");
  controller.undo(); assert.equal(main.getPresent().steps[0]!.note, "main");
  assert.equal(session.getState().dirty, false);
  controller.redo(); controller.redo(); controller.redo();
  assert.equal(main.getPresent().steps[0]!.note, "main edit");
  assert.equal(nested.getPresent().steps[0]!.note, "nested edit");
  assert.equal(session.readMetadata()!.title, "New title");
  assert.match(session.getState().content, /9223372036854775807/);
  assert.match(session.getState().content, /0\.12345678901234567890123456789/);
  assert.match(session.getState().content, /1e999/);
  assert.match(session.getState().metadata!.content, /9223372036854775807/);
  assert.equal(results.length, 8);
});

test("late surface callbacks and history actions cannot edit a departed document owner", () => {
  const session = createProgramDocumentSession({ content, identity: { documentKey: "departed" } });
  let current = true; let notified = 0;
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => current, onChange: () => { notified++; } });
  const surface = controller.getSurface("main"); const next = surface.getPresent(); next.steps[0]!.note = "edit";
  surface.commit(next); assert.equal(notified, 1);
  current = false;
  next.steps[0]!.note = "late"; surface.commit(next); controller.undo(); controller.redo();
  assert.equal(notified, 1);
  assert.equal(session.readSnapshot().steps[0]!.note, "edit");
  assert.equal(session.getHistoryState().undoDepth, 1);
});

test("save reads never duplicate history; late acknowledgements retain later edits and undo against the saved baseline", () => {
  const session = createProgramDocumentSession({ content, identity: { documentKey: "save" } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange: (result) => assert.equal(result.ok, true) });
  const surface = controller.getSurface("main");
  const edit = (note: string) => { const next = surface.getPresent(); next.steps[0]!.note = note; surface.commit(next); };
  edit("first"); edit("first");
  assert.equal(session.getHistoryState().undoDepth, 1);
  const save = session.beginSave(controller.getSnapshot); assert.equal(save.ok, true); if (!save.ok) return;
  assert.equal(session.getHistoryState().undoDepth, 1);
  edit("second"); session.completeSave(save.ticket, { ok: true });
  assert.equal(surface.getPresent().steps[0]!.note, "second");
  assert.equal(session.getState().dirty, true);
  controller.undo(); assert.equal(session.getState().dirty, false);
  controller.undo(); assert.equal(surface.getPresent().steps[0]!.note, "main"); assert.equal(session.getState().dirty, true);
});

test("subprogram property dialogs use current revision but retain their captured owner and property baseline", () => {
  const session = createProgramDocumentSession({ content, identity: { documentKey: "properties" } });
  let current = true;
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => current, onChange: () => {} });
  const row = controller.getSnapshot().subPrograms[0]!;
  const expected = { identity: controller.getIdentity(), properties: { name: row.name, description: row.description, icon: row.icon } };
  const main = controller.getSurface("main"); const next = main.getPresent(); next.steps[0]!.note = "flushed while opening properties"; main.commit(next);
  const patch = { name: "Renamed", description: "new", icon: "iconify:mdi:plus" };
  assert.equal(controller.applySubProgramProperties(row.id, patch, expected).ok, true);
  assert.equal(controller.getSnapshot().subPrograms[0]!.name, "Renamed");
  assert.equal(controller.getHistoryState().undoDepth, 2);
  const before = session.getState();
  assert.equal(controller.applySubProgramProperties(row.id, { ...patch, name: "stale" }, expected).ok, false);
  assert.equal(session.getState(), before);
  const latest = { identity: controller.getIdentity(), properties: patch };
  current = false;
  assert.equal(controller.applySubProgramProperties(row.id, { ...patch, name: "departed" }, latest).ok, false);
  assert.equal(session.getState(), before);
});
