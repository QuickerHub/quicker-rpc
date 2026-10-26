import assert from "node:assert/strict";
import test from "node:test";
import { createProgramDocumentSession } from "./programDocumentSession";
import { createProgramDocumentEditorController } from "../program/programDocumentEditorController";
import { parseLosslessJson, stringifyLosslessJson } from "../shared/losslessJson";

const row = '{"id":"source","key":"value","varType":13,"default":"text","inputParamInfo":{"visibleExpression":"$=true","future":9223372036854775807},"outputParamInfo":{"visibleExpression":"$=true","future":1e999},"tableDef":{"fields":[{"fieldKey":"a","future":9007199254740993}]},"future":{"decimal":1.0000000000000001}}';
const body = `{"steps":[{"stepId":"step","stepRunnerKey":"sys:comment","note":"before"}],"variables":[${row}],"subPrograms":[{"id":"child","kind":1,"steps":[],"variables":[{"id":"source","key":"child"}],"variableCount":1}],"future":1e999}`;
function fixture(content = body) {
  const session = createProgramDocumentSession({ content, identity: { documentKey: "clipboard" } });
  let current = true;
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => current, onChange: () => {} });
  return { session, controller, main: controller.getSurface("main"), leave: () => { current = false; } };
}

test("Session raw copy/paste preserves all metadata through one undo, ordinary edit and save ticket", () => {
  const { session, controller, main } = fixture();
  const original = session.getState();
  const copied = main.exportVariables(["source"]); assert.ok(copied.ok);
  assert.equal(session.getState(), original);
  session.transact({ expectedRevision: 0, source: "agent", update(document) { (document.steps as { note: string }[])[0]!.note = "latest"; } });
  const beforePaste = session.getState().content;
  const result = main.pasteVariables(copied.text); assert.ok(result.ok);
  assert.equal(session.getHistoryState().undoDepth, 2);
  assert.equal(main.getPresent().steps[0]!.note, "latest");
  const raw = parseLosslessJson(session.getState().content) as { variables: Record<string, unknown>[] };
  const expected = parseLosslessJson(row) as Record<string, unknown>;
  // Known DTO aliases normalize; unknown data and numeric lexemes remain lossless.
  expected.defaultValue = expected.default; delete expected.default;
  assert.deepEqual(raw.variables[1], { ...expected, id: result.insertedIds[0], key: "value_copy" });
  controller.undo(); assert.equal(session.getState().content, beforePaste);
  controller.redo(); assert.equal(main.getPresent().variables.length, 2);
  const next = main.getPresent(); next.variables[1]!.desc = "ordinary UI edit"; main.commit(next);
  for (const token of ["9223372036854775807", "9007199254740993", "1.0000000000000001", "1e999"]) assert.ok(session.getState().content.includes(token));
  const ticket = session.beginSave(() => session.readSnapshot()); assert.ok(ticket.ok);
  if (ticket.ok) assert.match(ticket.ticket.content, /ordinary UI edit/);
});

test("legacy raw rows without IDs copy by current unique projection without mutating source", () => {
  const { session, main } = fixture(body.replace('"id":"source",', ""));
  const original = session.getState(), id = main.getPresent().variables[0]!.id;
  assert.ok(id);
  const copied = main.exportVariables([id]); assert.ok(copied.ok);
  assert.equal(session.getState(), original);
  assert.match(copied.text, /9223372036854775807/);
  const pasted = main.pasteVariables(copied.text); assert.ok(pasted.ok);
  assert.notEqual(pasted.insertedIds[0], id);
  assert.equal(main.getPresent().variables[0]!.id, id);
  const raw = parseLosslessJson(session.getState().content) as { variables: Record<string, unknown>[] };
  assert.equal(Object.hasOwn(raw.variables[0]!, "id"), false);
});

test("nested surfaces paste into the selected scope and keep sibling identity separate", () => {
  const { session, controller, main } = fixture();
  const copied = main.exportVariables(["source"]); assert.ok(copied.ok);
  const nested = controller.getSurface("sub-child");
  const paste = nested.pasteVariables(copied.text); assert.ok(paste.ok);
  assert.equal(main.getPresent().variables.length, 1); assert.equal(nested.getPresent().variables.length, 2);
  const raw = parseLosslessJson(session.getState().content) as { subPrograms: { variableCount: number; variables: unknown[] }[] };
  assert.equal(raw.subPrograms[0]!.variableCount, 2);
  assert.match(stringifyLosslessJson(raw.subPrograms[0]!.variables[1]), /9223372036854775807/);
});

test("unowned, ambiguous and departed surfaces cannot export or paste or alter history", () => {
  const source = fixture().main.exportVariables(["source"]); assert.ok(source.ok);
  for (const content of [body.replace('"id":"source","key":"value"', '"id":"source","Id":"other","key":"value"'),
    body.replace('"variables":[', '"Variables":[],"variables":['), body.replace('"key":"value"', '"key":"value","key":"other"'),
    body.replace(`[${row}]`, `[${row},${row}]`)]) {
    const { session, main } = fixture(content), before = session.getState();
    assert.equal(main.exportVariables(["source"]).ok, false);
    assert.equal(main.pasteVariables(source.text).ok, false);
    assert.equal(session.getState(), before);
  }
  for (const content of [body.replace('"kind":1', '"kind":2'), body.replace('"kind":1', '"kind":1,"Kind":2'), body.replace('"subPrograms":[', '"SubPrograms":[],"subPrograms":[')]) {
    const { session, controller } = fixture(content), before = session.getState(), target = controller.getSurface("sub-child");
    assert.equal(target.exportVariables(["source"]).ok, false); assert.equal(target.pasteVariables(source.text).ok, false); assert.equal(session.getState(), before);
  }
  const departed = fixture(), before = departed.session.getState(); departed.leave();
  assert.equal(departed.main.exportVariables(["source"]).ok, false); assert.equal(departed.main.pasteVariables(source.text).ok, false); assert.equal(departed.session.getState(), before);
  const closed = fixture(); closed.session.close(); assert.equal(closed.main.exportVariables(["source"]).ok, false); assert.equal(closed.main.pasteVariables(source.text).ok, false);
});

test("external default files are refused for both directions with unchanged Session and no partial batch", () => {
  for (const field of ['"default.file":"files/value"', '"defaultValue.file":"files/value"', '"defaultValueFile":"files/value"', '"DefaultValueFile":"files/value"', '"defaultValue":{"file":"files/value"}']) {
    const { session, main } = fixture(body.replace('"default":"text"', field)), before = session.getState();
    assert.equal(main.exportVariables(["source"]).ok, false);
    assert.equal(main.pasteVariables(`[{"key":"valid"},{"key":"external",${field}}]`).ok, false);
    assert.equal(session.getState(), before);
  }
});
