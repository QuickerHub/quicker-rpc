import assert from "node:assert/strict";
import test from "node:test";
import { ActionStep, ActionVariable } from "../types/common";
import { exportProgramVariables, prepareProgramVariablePaste, parseProgramVariableClipboardRows, serializeProgramVariableClipboardRows } from "./programVariableClipboard";
import { buildActionStepsClipboardJson, parseActionStepsClipboardJson } from "../steps/actionStepsClipboard";
import { parseLosslessJson, stringifyLosslessJson } from "../shared/losslessJson";

const rich = '{"id":"original","key":"变量","varType":"table","default":"inline","inputParamInfo":{"visibleExpression":"$=true","future":9223372036854775807},"outputParamInfo":{"visibleExpression":"$=false","future":1e999},"tableDef":{"fields":[{"fieldKey":"a","label":"A","future":9007199254740993}],"future":-0},"futureRoot":{"value":1.0000000000000001,"__proto__":{"safe":true}}}';

test("native ActionStepsDto and historical array forms preserve advanced metadata and unknown numeric tokens", () => {
  const rows = parseProgramVariableClipboardRows(`[${rich}]`);
  const dto = serializeProgramVariableClipboardRows(rows);
  assert.equal((JSON.parse(dto) as { Steps: { InputParams: { note: { Value: string } }; Note: string }[] }).Steps[0]!.InputParams.note.Value, "$${变量}");
  assert.equal((JSON.parse(dto) as { Steps: { Note: string }[] }).Steps[0]!.Note, "");
  assert.match(dto, /"InputParamInfo"/); assert.match(dto, /"VisibleExpression"/); assert.match(dto, /"TableDef"/); assert.match(dto, /"FieldKey"/);
  for (const token of ["9223372036854775807", "1e999", "9007199254740993", "1.0000000000000001"]) assert.ok(dto.includes(token));
  const decoded = parseProgramVariableClipboardRows(dto);
  assert.deepEqual(decoded, rows);
  assert.equal(Object.prototype.hasOwnProperty.call(decoded[0]!.futureRoot, "__proto__"), true);
});

test("each whole batch receives distinct IDs and case-insensitively collision-free copy names", () => {
  const present = { steps: [ActionStep.create({ note: "keep" })], variables: [ActionVariable.create({ id: "v-1", key: "one_copy" }), ActionVariable.create({ id: "v-2", key: "ONE_COPY_2" })] };
  const text = '[{"id":"same","key":"one","varType":0},{"id":"same","key":"one","varType":0}]';
  const result = prepareProgramVariablePaste(present, text); assert.ok(result.ok);
  assert.deepEqual(result.present.variables.slice(2).map((row) => row.key), ["one_copy_3", "one_copy_4"]);
  assert.equal(new Set(result.present.variables.map((row) => row.id)).size, 4);
  const repeated = prepareProgramVariablePaste(result.present, text); assert.ok(repeated.ok);
  assert.equal(new Set(repeated.present.variables.map((row) => row.id)).size, 6);
  assert.equal(new Set(repeated.present.variables.map((row) => row.key.toLowerCase())).size, 6);
  assert.equal(present.variables.length, 2); assert.equal(result.present.steps[0]!.note, "keep");
});

test("standalone export and paste retain runtime extras and do not rebuild nested metadata", () => {
  const pasted = prepareProgramVariablePaste({ steps: [], variables: [] }, `[${rich}]`); assert.ok(pasted.ok);
  const exported = exportProgramVariables(pasted.present, pasted.insertedIds); assert.ok(exported.ok);
  for (const token of ["9223372036854775807", "1e999", "9007199254740993", "1.0000000000000001"]) assert.ok(exported.text.includes(token));
  assert.match(exported.text, /futureRoot/);
  assert.equal(pasted.present.variables[0]!.inputParamInfo!.inputMethod, 0);
  const nullable = prepareProgramVariablePaste({ steps: [], variables: [] }, '[{"key":"nullable","defaultValue":null,"inputParamInfo":null,"tableDef":null}]');
  assert.ok(nullable.ok);
  assert.doesNotThrow(() => ActionVariable.toJSON(nullable.present.variables[0]!));
});

test("ambiguous, duplicate, unsupported and external defaults fail without changing present", () => {
  const present = { steps: [], variables: [ActionVariable.create({ id: "one", key: "one" })] };
  for (const row of ['{"key":"x","Key":"x"}', '{"key":"x","key":"x"}', '{"key":"x","varType":"future-type"}',
    ...['"default.file":"files/x"', '"defaultValue.file":"files/x"', '"defaultValueFile":"files/x"', '"DefaultValueFile":"files/x"', '"defaultValue":{"file":"files/x"}', '"DefaultValue":{"File":"files/x"}'].map((field) => `{"key":"x",${field}}`),
    '{"key":"x","inputParamInfo":{"visibleExpression":"a","VisibleExpression":"b"}}',
    '{"key":"x","tableDef":{"fields":[{"fieldKey":"a","FieldKey":"b"}]}}']) {
    const before = structuredClone(present);
    assert.equal(prepareProgramVariablePaste(present, `[${row}]`).ok, false, row);
    assert.deepEqual(present, before);
  }
  const external = { ...ActionVariable.create({ id: "x", key: "x" }), defaultValueFile: "files/x" };
  assert.equal(exportProgramVariables({ steps: [], variables: [external] }, ["x"]).ok, false);
});

test("existing step clipboard variable conversion shares the lossless codec and allocates unique IDs", () => {
  const result = prepareProgramVariablePaste({ steps: [], variables: [] }, `[${rich},${rich}]`); assert.ok(result.ok);
  const dto = buildActionStepsClipboardJson([ActionStep.create({ stepRunnerKey: "sys:comment" })], result.present.variables);
  const parsed = parseActionStepsClipboardJson(dto); assert.ok(parsed);
  assert.notEqual(parsed.variables[0]!.id, parsed.variables[1]!.id);
  assert.equal(parsed.variables[0]!.inputParamInfo!.visibleExpression, "$=true");
  assert.equal(parsed.variables[0]!.tableDef!.fields[0]!.fieldKey, "a");
  assert.match(stringifyLosslessJson(parsed.variables), /9223372036854775807/);
  assert.equal(parseActionStepsClipboardJson('{"Steps":[{}],"Variables":[{"Key":"x","DefaultValueFile":"file"}]}'), null);
  assert.equal(parseActionStepsClipboardJson('{"Steps":[{}],"Variables":[{"Key":"x","Key":"y"}]}'), null);
  assert.deepEqual(parseLosslessJson(dto) !== null, true);
});
