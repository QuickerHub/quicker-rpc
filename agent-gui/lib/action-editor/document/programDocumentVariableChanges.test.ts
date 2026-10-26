import assert from "node:assert/strict";
import test from "node:test";
import { createProgramDocumentSession } from "./programDocumentSession";
import { createProgramDocumentEditorController } from "../program/programDocumentEditorController";
import { ActionVariable } from "../types/common";

const source = '{"steps":[{"stepId":"step","stepRunnerKey":"sys:evalexpression","inputParams":{"expression":{"Value":"$={old}","future":9223372036854775807},"bound.var":"old"},"outputParams":{"output":"old.member"},"note":"before"}],"variables":[{"id":"stable","key":"old","varType":9,"default":"","future":1e999}],"summaryExpression":"plain {old}","subPrograms":[{"id":"child","name":"child","kind":1,"steps":[{"stepId":"child-step","stepRunnerKey":"sys:evalexpression","inputParams":{"expression":"$={old}"}}],"variables":[{"id":"child-variable","key":"old"}]}]}';

const leanSource = '{"steps":[{"key":"sys:if","disabled":true,"inputs":{"bound.var":"old","expression":{"Value":"$={old}","future":9223372036854775807}},"outputs":{"result":"old.member"},"ifSteps":[{"key":"sys:notify","inputs":{"msg.var":"old"}}],"elseSteps":[{"stepRunnerKey":"sys:evalexpression","inputParams":{"expression":"$={old}"}}]}],"variables":[{"key":"old","default":"","future":1.0000000000000001}],"subPrograms":[{"id":"child","kind":1,"steps":[{"key":"sys:notify","inputs":{"msg.var":"old"}}],"variables":[{"key":"old"}]}]}';

test("lean CLI variables rename direct, expression and output bindings in their original fields through save and undo", () => {
  const session = createProgramDocumentSession({ content: leanSource, identity: { documentKey: "lean" } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange: () => {} });
  const surface = controller.getSurface("main"), expected = surface.getPresent().variables[0]!;
  const result = surface.changeVariables({ kind: "edit", expected, next: { ...expected, key: "renamed" } });
  assert.equal(result.ok, true, !result.ok ? result.error : "rename succeeded");
  const content = session.getState().content;
  const body = JSON.parse(content), step = body.steps[0];
  assert.equal(step.key, "sys:if"); assert.equal(step.disabled, true);
  assert.equal(step.inputs["bound.var"], "renamed"); assert.equal(step.inputs.expression.value, "$={renamed}");
  assert.equal(step.outputs.result, "renamed.member");
  assert.equal(step.ifSteps[0].inputs["msg.var"], "renamed");
  assert.equal(step.elseSteps[0].inputParams.expression, "$={renamed}");
  for (const key of ["stepRunnerKey", "inputParams", "outputParams"]) assert.equal(Object.hasOwn(step, key), false, key);
  assert.equal(body.subPrograms[0].steps[0].inputs["msg.var"], "old", "child scope remains independent");
  assert.match(content, /9223372036854775807/); assert.match(content, /1\.0000000000000001/);
  assert.equal(surface.getPresent().steps[0]!.inputParams.bound!.varKey, "renamed");
  const save = session.beginSave(() => session.readSnapshot());
  assert.ok(save.ok); assert.equal(save.ticket.content, content);
  assert.equal(session.completeSave(save.ticket, { ok: true }).ok, true);
  assert.equal(session.getState().dirty, false);
  controller.undo(); assert.equal(session.getState().content, leanSource); assert.equal(session.getState().dirty, true);
  controller.redo(); assert.equal(session.getState().content, content); assert.equal(session.getState().dirty, false);
});

test("a newly added variable beside ID-less lean rows keeps its mapping for the next form commit", () => {
  const session = createProgramDocumentSession({ content: leanSource, identity: { documentKey: "lean-add" } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange: () => {} });
  const surface = controller.getSurface("main"), present = surface.getPresent();
  const originalId = present.variables[0]!.id;
  present.variables.push(ActionVariable.create({ id: "v-new", key: "var_3917" }));
  surface.commit(present);
  const before = session.getState().content, expected = surface.getPresent().variables[1]!;
  const result = surface.changeVariables({ kind: "edit", expected, next: { ...expected, key: "clipboardAcceptance", defaultValue: "inline", desc: "description", group: "acceptance", isLocked: true } });
  assert.equal(result.ok, true, !result.ok ? result.error : "form committed");
  assert.equal(surface.getPresent().variables[0]!.id, originalId);
  assert.equal(surface.getPresent().variables[1]!.id, "v-new");
  assert.equal(surface.getPresent().variables[1]!.key, "clipboardAcceptance");
  const step = JSON.parse(session.getState().content).steps[0];
  assert.equal(step.inputs["bound.var"], "old"); assert.equal(Object.hasOwn(step, "inputParams"), false);
  assert.match(session.getState().content, /1\.0000000000000001/);
  controller.undo(); assert.equal(session.getState().content, before);
});

test("lean projection retains external-file refusal and stale variable baselines", () => {
  const external = leanSource.replace('"default":""', '"default.file":"files/default.txt"');
  const session = createProgramDocumentSession({ content: external, identity: { documentKey: "lean-external" } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange: () => {} });
  const surface = controller.getSurface("main"), expected = surface.getPresent().variables[0]!;
  const before = session.getState();
  for (const request of [{ kind: "edit" as const, expected, next: { ...expected, key: "renamed" } }, { kind: "delete" as const, expected: [expected] }]) {
    const result = surface.changeVariables(request);
    assert.equal(result.ok, false);
    assert.match(!result.ok ? result.error : "", /外置默认值/);
    assert.equal(session.getState(), before);
  }
  assert.equal(surface.changeVariables({ kind: "edit", expected, next: { ...expected, desc: "allowed metadata" } }).ok, true);
  const after = session.getState();
  assert.equal(surface.changeVariables({ kind: "edit", expected, next: { ...expected, desc: "stale" } }).ok, false);
  assert.equal(session.getState(), after);
});

test("variable reference transactions still refuse unprojected Pascal fields without history", () => {
  for (const step of [
    { Key: "sys:notify" }, { StepRunnerKey: "sys:notify" },
    { Inputs: { "msg.var": "old" } }, { InputParams: { "msg.var": "old" } },
    { Outputs: { result: "old" } }, { OutputParams: { result: "old" } },
    { key: "sys:notify", Key: "sys:other" },
  ]) {
    const session = createProgramDocumentSession({ content: JSON.stringify({ steps: [step], variables: [{ id: "v", key: "old" }] }), identity: { documentKey: "pascal" } });
    const surface = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange: () => {} }).getSurface("main");
    const expected = surface.getPresent().variables[0]!, before = session.getState();
    for (const request of [{ kind: "edit" as const, expected, next: { ...expected, key: "renamed" } }, { kind: "delete" as const, expected: [expected] }]) {
      assert.equal(surface.changeVariables(request).ok, false);
      assert.equal(session.getState(), before);
      assert.equal(session.getHistoryState().undoDepth, 0);
    }
  }
});

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
