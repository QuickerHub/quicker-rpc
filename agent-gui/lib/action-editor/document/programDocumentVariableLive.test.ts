import assert from "node:assert/strict";
import { test } from "node:test";
import { createProgramDocumentSession } from "./programDocumentSession";
import { createProgramDocumentEditorController } from "../program/programDocumentEditorController";
import { readProgramDocumentVariable, prepareProgramDocumentVariableLiveChange, type ProgramDocumentVariableFieldChange, type ProgramDocumentVariableSelector } from "./programDocumentVariableLive";
import { parseLosslessJson, stringifyLosslessJson } from "../shared/losslessJson";

const main = { surface: "main", variableId: "stable" };
const source = '{"steps":[{"stepId":"s","key":"sys:evalexpression","inputs":{"expression":"$={old}","bound.var":"old"},"outputs":{"output":"old.member"},"unknown":9223372036854775807}],"variables":[{"id":"stable","key":"old","varType":0,"default":"initial","future":0.12345678901234567890123456789},{"id":"other","key":"untouched","default":"keep"}],"subPrograms":[{"id":"child","kind":1,"name":"child","steps":[{"stepId":"child-s","key":"sys:evalexpression","inputs":{"expression":"$={old}"}}],"variables":[{"id":"stable","key":"old","default":"child"}],"subPrograms":[]}],"rootUnknown":1e999}';
const change = (field: string, value: unknown): ProgramDocumentVariableFieldChange => ({ field, valueJson: JSON.stringify(value) });
function variable(content = source, selector: ProgramDocumentVariableSelector = main) {
  const read = readProgramDocumentVariable(content, selector);
  assert.ok(read.ok, read.ok ? "" : read.error);
  return read.variable;
}
function fixture(content = source) {
  const session = createProgramDocumentSession({ content, identity: { documentKey: "variable-live-test", storage: { key: "test-source", version: "initial" } } });
  let current = true;
  const notifications: unknown[] = [];
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => current, onChange(result) { notifications.push(result); } });
  return { session, controller, notifications, leave: () => { current = false; }, edit(changes: readonly ProgramDocumentVariableFieldChange[], selector = main) {
    const read = variable(session.getState().content, selector);
    return controller.applyAgentVariableChange({ ...selector, contractRevision: read.contract.revision, changes,
      expectedIdentity: session.getState().identity, expectedRevision: session.getState().revision });
  } };
}

test("variable read reports the complete field matrix and lossless selected raw row without native claims", () => {
  const read = variable(), fields = new Map(read.contract.fields.map(field => [field.field, field]));
  assert.equal(read.contract.source, "document-controller"); assert.equal(read.contract.nativeValidation, "unobserved");
  assert.match(read.variableJson, /0\.12345678901234567890123456789/); assert.equal(read.defaultKind, "inline-string");
  for (const key of ["key", "desc", "group", "saveState", "isLocked", "defaultValue"]) assert.equal(fields.get(key)?.editable, true, key);
  for (const key of ["id", "varType", "customType", "isInput", "isOutput", "paramName", "inputParamInfo", "outputParamInfo", "tableDef", "defaultValueFile", "future"]) {
    assert.equal(fields.get(key)?.editable, false, key); assert.ok(fields.get(key)?.reason, key);
  }
});

test("one Agent multi-field rename updates proven references in the selected surface and one original undo", () => {
  const f = fixture(), baseline = f.session.getState().content;
  const result = f.edit([change("key", "renamed"), change("desc", "new description"), change("group", "group"), change("saveState", true), change("isLocked", true), change("defaultValue", "next")]);
  assert.ok(result.ok, result.ok ? "" : result.error);
  assert.deepEqual(result.changedFields, ["key", "desc", "group", "saveState", "isLocked", "defaultValue"]);
  assert.equal(f.session.getState().lastChangeSource, "agent"); assert.equal(f.session.getHistoryState().undoDepth, 1);
  const body = JSON.parse(f.session.getState().content);
  assert.equal(body.variables[0].key, "renamed"); assert.equal(body.variables[0].id, "stable");
  assert.equal(body.steps[0].inputs["bound.var"], "renamed"); assert.equal(body.steps[0].inputs.expression, "$={renamed}");
  assert.equal(body.steps[0].outputs.output, "renamed.member");
  assert.equal(body.subPrograms[0].variables[0].key, "old"); assert.equal(body.subPrograms[0].steps[0].inputs.expression, "$={old}");
  assert.equal(body.variables[1].key, "untouched");
  assert.match(f.session.getState().content, /9223372036854775807/); assert.match(f.session.getState().content, /0\.12345678901234567890123456789/); assert.match(f.session.getState().content, /1e999/);
  f.controller.undo(); assert.equal(f.session.getState().content, baseline);
  f.controller.redo(); assert.equal(f.session.getState().lastChangeSource, "ui"); assert.equal(JSON.parse(f.session.getState().content).variables[0].key, "renamed");
});

test("equal raw variable IDs in different owned surfaces remain independently writable", () => {
  const f = fixture();
  assert.equal(variable(source, { surface: "sub-child", variableId: "stable" }).variableId, "stable");
  assert.ok(f.edit([change("desc", "nested only")], { surface: "sub-child", variableId: "stable" }).ok);
  const body = JSON.parse(f.session.getState().content);
  assert.equal(body.subPrograms[0].variables[0].desc, "nested only"); assert.equal(body.variables[0].desc, undefined);
  assert.equal(f.session.getHistoryState().undoDepth, 1); f.controller.undo(); assert.equal(f.session.getState().content, source);
});

test("a real selected raw ID cannot make the serializer persist unrelated projection-generated variable or step IDs", () => {
  for (const [content, target] of [
    [source.replace('"id":"other",', ""), main],
    [source.replace('"stepId":"s",', ""), main],
    [source.replace('"stepId":"child-s",', ""), { surface: "sub-child", variableId: "stable" }],
  ] as const) {
    const f = fixture(content), before = f.session.getState(), read = variable(content, target);
    const prepared = prepareProgramDocumentVariableLiveChange(content, { ...target, contractRevision: read.contract.revision, changes: [change("desc", "otherwise safe metadata")] });
    assert.equal(prepared.ok, false, content); if (!prepared.ok) assert.equal(prepared.code, "VARIABLE_IDENTITY_MAPPING_UNPROVEN");
    assert.equal(f.edit([change("desc", "otherwise safe metadata")], target).ok, false);
    assert.equal(f.session.getState(), before); assert.equal(f.session.getHistoryState().undoDepth, 0);
  }
  const untouchedChild = source.replace('"stepId":"child-s",', "").replace('"id":"stable","key":"old","default":"child"', '"key":"old","default":"child"');
  const safe = fixture(untouchedChild);
  assert.ok(safe.edit([change("desc", "main only")]).ok);
  const child = JSON.parse(safe.session.getState().content).subPrograms[0];
  assert.equal(Object.hasOwn(child.steps[0], "stepId"), false); assert.equal(Object.hasOwn(child.variables[0], "id"), false);
});

test("projection-only, duplicate or aliased variable identity and unowned or ambiguous ancestor surfaces cannot mint a detail", () => {
  const cases: [string, ProgramDocumentVariableSelector][] = [
    [source.replace('"id":"stable",', ""), { surface: "main", variableId: "v-1" }],
    [source.replace('"id":"other"', '"id":"stable"'), main],
    [source.replace('"id":"stable"', '"Id":"stable","id":"stable"'), main],
    [source.replace('"key":"old"', '"key":"hidden","key":"old"'), main],
    [source.replace('"kind":1', '"kind":2'), { surface: "sub-child", variableId: "stable" }],
    [source.replace('"subPrograms":[]}', '"subPrograms":[]},{"id":"child","kind":1,"steps":[],"variables":[]}'), { surface: "sub-child", variableId: "stable" }],
    ['{"steps":[],"variables":[],"subPrograms":[{"id":"parent","kind":1,"steps":[],"variables":[],"subPrograms":[{"id":"deep","kind":1,"steps":[],"variables":[{"id":"stable","key":"local"}]}]},{"id":"parent","kind":1,"steps":[],"variables":[]}]}', { surface: "sub-deep", variableId: "stable" }],
  ];
  for (const [content, target] of cases) assert.equal(readProgramDocumentVariable(content, target).ok, false, content);
});

test("every supported inline default alias retains its wire name and explicit empty-string semantics", () => {
  for (const alias of ["default", "defaultValue", "DefaultValue", "default_value"]) {
    const content = '{"steps":[],"variables":[{"id":"stable","key":"value",' + JSON.stringify(alias) + ':"initial","future":9223372036854775807}],"subPrograms":[]}';
    const f = fixture(content);
    assert.ok(f.edit([change("defaultValue", "")]).ok, alias);
    const empty = JSON.parse(f.session.getState().content).variables[0];
    assert.equal(empty[alias], "", alias); assert.equal(Object.hasOwn(empty, alias), true, alias);
    for (const other of ["default", "defaultValue", "DefaultValue", "default_value"]) if (other !== alias) assert.equal(Object.hasOwn(empty, other), false, alias);
    assert.ok(f.edit([change("defaultValue", "later")]).ok, alias);
    assert.equal(JSON.parse(f.session.getState().content).variables[0][alias], "later"); assert.match(f.session.getState().content, /9223372036854775807/);
    f.controller.undo(); assert.equal(JSON.parse(f.session.getState().content).variables[0][alias], "");
    f.controller.undo(); assert.equal(f.session.getState().content, content);
  }
});

test("opaque, file, ambiguous, missing and dynamic defaults are denied individually while metadata preserves them", () => {
  for (const [wire, kind] of [
    ['"default":9223372036854775807', "opaque"], ['"default":null', "opaque"], ['"default":{"future":[1e999,null]}', "opaque"],
    ['"default.file":"files/default.txt"', "file"], ['"defaultValue":{"file":"files/default.txt","future":9223372036854775807}', "file"],
    ['"default":"a","DefaultValue":"b"', "ambiguous"], ["", "missing"], ['"default":"$={runtime}"', "unknown-expression"],
  ]) {
    const content = '{"steps":[],"variables":[{"id":"stable","key":"value","varType":99' + (wire ? "," + wire : "") + ',"future":0.12345678901234567890123456789}],"subPrograms":[]}';
    const f = fixture(content), read = variable(content);
    assert.equal(read.defaultKind, kind); assert.equal(read.contract.fields.find(field => field.field === "defaultValue")?.editable, false);
    const before = f.session.getState(); assert.equal(f.edit([change("defaultValue", "replacement")]).ok, false); assert.equal(f.session.getState(), before);
    assert.ok(f.edit([change("desc", "metadata"), change("group", "safe")]).ok, kind);
    const original = parseLosslessJson(content) as { variables: Record<string, unknown>[] }, updated = parseLosslessJson(f.session.getState().content) as typeof original;
    delete updated.variables[0]!.desc; delete updated.variables[0]!.group;
    assert.equal(stringifyLosslessJson(updated.variables[0]), stringifyLosslessJson(original.variables[0]), kind);
  }
});

test("interface, unsupported references and external defaults cannot be bypassed by combining a rename with metadata", () => {
  for (const content of [
    source.replace('"varType":0', '"varType":0,"isInput":true'),
    source.replace('"varType":0', '"varType":0,"isOutput":true'),
    source.replace('"default":"initial"', '"default.file":"files/default.txt"'),
    source.replace('"rootUnknown":1e999', '"futureExpression":"$={old}"'),
    source.replace('"expression":"$={old}"', '"script":"$={old}"'),
  ]) {
    const f = fixture(content), before = f.session.getState();
    assert.equal(f.edit([change("key", "renamed"), change("desc", "must stay atomic")]).ok, false);
    assert.equal(f.session.getState(), before); assert.equal(f.session.getHistoryState().undoDepth, 0);
  }
});

test("strict field/value/budget validation rejects the whole mutation without a history entry", () => {
  const f = fixture(), baseline = f.session.getState();
  const invalid: readonly ProgramDocumentVariableFieldChange[][] = [
    [], [change("desc", "a"), change("desc", "b")], [change("id", "replacement")], [change("varType", 1)],
    [change("isInput", false)], [change("tableDef", {})], [change("future", "overwrite")], [change("desc", null)],
    [change("saveState", "true")], [{ field: "desc", valueJson: "not json" }], [change("desc", "a".repeat(100_001))],
    Array.from({ length: 17 }, (_, index) => change(`future-${index}`, "x")),
    [change("desc", "\u0000".repeat(100_000)), change("group", "\u0000".repeat(100_000))],
    [change("defaultValue", "$={dynamic}")],
  ];
  for (const changes of invalid) { assert.equal(f.edit(changes).ok, false); assert.equal(f.session.getState(), baseline); }
  assert.equal(f.session.getHistoryState().undoDepth, 0);
});

test("field denials participate in the observed contract revision and cannot be dropped before a write", () => {
  const ordinary = variable(), options = { fieldDenials: { key: "Source rename mapping is unproven." } };
  const read = readProgramDocumentVariable(source, main, options); assert.ok(read.ok);
  assert.notEqual(read.variable.contract.revision, ordinary.contract.revision);
  assert.equal(read.variable.contract.fields.find(field => field.field === "key")?.editable, false);
  assert.equal(prepareProgramDocumentVariableLiveChange(source, { ...main, contractRevision: ordinary.contract.revision, changes: [change("desc", "x")] }, options).ok, false);
  const denied = prepareProgramDocumentVariableLiveChange(source, { ...main, contractRevision: read.variable.contract.revision, changes: [change("key", "renamed")] }, options);
  assert.equal(denied.ok, false); if (!denied.ok) assert.equal(denied.code, "VARIABLE_FIELD_DENIED");
  assert.equal(prepareProgramDocumentVariableLiveChange(source, { ...main, contractRevision: read.variable.contract.revision, changes: [change("desc", "safe")] }, options).ok, true);
});

test("Agent wrapper uses the actual read revision and complete identity instead of adopting current UI state", () => {
  const f = fixture(), read = variable(), identity = structuredClone(f.session.getState().identity);
  assert.ok(f.session.transact({ expectedRevision: 0, source: "ui", update(body) { (body.steps as { note: string }[])[0]!.note = "new human draft"; } }).ok);
  const before = f.session.getState();
  const input = { ...main, expectedRevision: 0, expectedIdentity: identity, contractRevision: read.contract.revision, changes: [change("desc", "late")] };
  const stale = f.controller.applyAgentVariableChange(input); assert.equal(stale.ok, false); if (!stale.ok) assert.equal(stale.code, "revision_conflict");
  assert.equal(f.session.getState(), before);
  const wrong = f.controller.applyAgentVariableChange({ ...input, expectedRevision: before.revision, expectedIdentity: { ...identity, storage: { key: "other", version: "initial" } } });
  assert.equal(wrong.ok, false); if (!wrong.ok) assert.equal(wrong.code, "identity_conflict");
  assert.equal(f.session.getState(), before); f.leave();
  assert.equal(f.controller.applyAgentVariableChange({ ...input, expectedRevision: before.revision }).ok, false); assert.equal(f.session.getState(), before);
});

test("no-op fields do not advance revision/history and a closed original session cannot mutate", () => {
  const f = fixture(), before = f.session.getState();
  const result = f.edit([change("key", "old"), change("defaultValue", "initial")]); assert.ok(result.ok); assert.equal(result.changed, false);
  assert.deepEqual(result.changedFields, []); assert.equal(f.session.getState(), before); assert.equal(f.session.getHistoryState().undoDepth, 0);
  const read = variable(); f.session.close();
  const closed = f.controller.applyAgentVariableChange({ ...main, expectedRevision: before.revision, expectedIdentity: before.identity,
    contractRevision: read.contract.revision, changes: [change("desc", "late")] });
  assert.equal(closed.ok, false); if (!closed.ok) assert.equal(closed.code, "closed");
});
