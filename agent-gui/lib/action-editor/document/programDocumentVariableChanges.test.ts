import assert from "node:assert/strict";
import test from "node:test";
import { createProgramDocumentSession } from "./programDocumentSession";
import { createProgramDocumentEditorController } from "../program/programDocumentEditorController";

const source = '{"steps":[{"stepId":"step","stepRunnerKey":"sys:evalexpression","inputParams":{"expression":{"Value":"$={old}","future":9223372036854775807},"bound.var":"old"},"outputParams":{"output":"old.member"},"note":"before"}],"variables":[{"id":"stable","key":"old","varType":9,"default":"","future":1e999}],"summaryExpression":"plain {old}","subPrograms":[{"id":"child","name":"child","kind":1,"steps":[{"stepId":"child-step","stepRunnerKey":"sys:evalexpression","inputParams":{"expression":"$={old}"}}],"variables":[{"id":"child-variable","key":"old"}]}]}';

test("controller renames against latest complete present in one lossless undo without touching child scope", () => {
  const session = createProgramDocumentSession({ content: source, identity: { documentKey: "variables" } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange: () => {} });
  const surface = controller.getSurface("main");
  const expected = surface.getPresent().variables[0]!;
  session.transact({ expectedRevision: 0, source: "agent", update: (body) => { (body.steps as { note: string }[])[0]!.note = "Agent draft"; } });
  const before = session.getState().content;
  const result = surface.changeVariables({ kind: "edit", expected, next: { ...expected, key: "newName" } });
  assert.equal(result.ok, true); assert.equal(session.getHistoryState().undoDepth, 2);
  assert.equal(surface.getPresent().steps[0]!.note, "Agent draft");
  assert.equal(surface.getPresent().steps[0]!.inputParams.bound!.varKey, "newName");
  assert.equal(controller.getSurface("sub-child").getPresent().variables[0]!.key, "old");
  assert.match(session.getState().content, /9223372036854775807/); assert.match(session.getState().content, /1e999/);
  assert.match(session.getState().content, /plain \{newName\}/);
  controller.undo(); assert.equal(session.getState().content, before);
  controller.redo(); assert.equal(surface.getPresent().variables[0]!.id, "stable");
});

test("stale variable draft and departed owner cannot replace latest rows or add history", () => {
  const session = createProgramDocumentSession({ content: source, identity: { documentKey: "stale" } });
  let current = true;
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => current, onChange: () => {} });
  const surface = controller.getSurface("main"), expected = surface.getPresent().variables[0]!;
  assert.equal(surface.changeVariables({ kind: "edit", expected, next: { ...expected, desc: "new human" } }).ok, true);
  const before = session.getState();
  assert.equal(surface.changeVariables({ kind: "edit", expected, next: { ...expected, key: "late" } }).ok, false);
  assert.equal(session.getState(), before);
  current = false;
  assert.equal(surface.changeVariables({ kind: "delete", expected: surface.getPresent().variables }).ok, false);
  assert.equal(session.getState(), before);
});

test("ambiguous raw pins and opaque defaults cannot be omitted by the editor projection", () => {
  for (const content of [source.replace('"bound.var":"old"', '"bound.var":"old","bound":"literal"'),
    source.replace('"default":""', '"default":{"future":"{old}"}'),
    source.replace('"Value":"$={old}"', '"Value":"$={old}","value":"$={old}"')]) {
    const session = createProgramDocumentSession({ content, identity: { documentKey: "unknown" } });
    const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange: () => {} });
    const surface = controller.getSurface("main"), expected = surface.getPresent().variables[0]!;
    const before = session.getState();
    assert.equal(surface.changeVariables({ kind: "edit", expected, next: { ...expected, key: "newName" } }).ok, false);
    assert.equal(session.getState(), before);
  }
});

test("raw permission aliases, opaque root references and duplicate keys fail without history", () => {
  for (const content of [source.replace('"varType":9', '"varType":9,"IsLocked":true'),
    source.replace('"varType":9', '"varType":9,"IsInput":true'),
    source.replace('"summaryExpression":"plain {old}"', '"futureExpression":"$={old}"'),
    source.replace('"key":"old"', '"key":"hidden","key":"old"'),
    source.replace('"varType":9', '"varType":9,"DefaultValueFile":"files/value.txt"')]) {
    const session = createProgramDocumentSession({ content, identity: { documentKey: "raw-guard" } });
    const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange: () => {} });
    const surface = controller.getSurface("main"), expected = surface.getPresent().variables[0]!;
    const before = session.getState();
    assert.equal(surface.changeVariables({ kind: "edit", expected, next: { ...expected, key: "newName" } }).ok, false);
    assert.equal(session.getState(), before);
  }
});

test("nested interface changes cannot silently break callers or be enabled by dropping input flags", () => {
  const content = source.replace('"id":"child-variable","key":"old"', '"id":"child-variable","key":"old","isInput":true');
  const session = createProgramDocumentSession({ content, identity: { documentKey: "interface" } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange: () => {} });
  const surface = controller.getSurface("sub-child"), expected = surface.getPresent().variables[0]!;
  const before = session.getState();
  assert.equal(surface.changeVariables({ kind: "edit", expected, next: { ...expected, key: "newName", isInput: false } }).ok, false);
  assert.equal(surface.changeVariables({ kind: "delete", expected: [expected] }).ok, false);
  assert.equal(session.getState(), before);
});

test("summary references take part in deletion and unowned/ambiguous child surfaces are refused", () => {
  const body = '{"steps":[],"variables":[{"id":"stable","key":"old"}],"SummaryExpression":"{old}"}';
  const session = createProgramDocumentSession({ content: body, identity: { documentKey: "summary" } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange: () => {} });
  const surface = controller.getSurface("main"), before = session.getState();
  assert.equal(surface.changeVariables({ kind: "delete", expected: surface.getPresent().variables }).ok, false);
  assert.equal(session.getState(), before);
  for (const content of [source.replace('"kind":1', '"kind":2'), source.replace('"subPrograms":[', '"SubPrograms":[],"subPrograms":['), source.replace('"kind":1', '"kind":1,"Kind":2')]) {
    const childSession = createProgramDocumentSession({ content, identity: { documentKey: "child" } });
    const child = createProgramDocumentEditorController(childSession, { isCurrent: () => true, onChange: () => {} }).getSurface("sub-child");
    const expected = child.getPresent().variables[0]!;
    assert.equal(child.changeVariables({ kind: "edit", expected, next: { ...expected, key: "newName" } }).ok, false);
    assert.equal(childSession.getHistoryState().undoDepth, 0);
  }
});
