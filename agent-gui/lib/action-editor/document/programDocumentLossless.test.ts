import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLosslessJson, stringifyLosslessJson } from "../shared/losslessJson";
import { normalizeProgramWireForDisk } from "../wire/normalizeProgramWireForDisk";
import { fingerprintProgramDocumentContent, parseProgramDocumentSnapshot, serializeProgramDocumentSnapshot } from "./programDocumentWire";
import { createProgramDocumentSession } from "./programDocumentSession";

const content = `{
  "future": {"int64":9223372036854775807,"precise":0.123456789012345678901,"exp":1.2300e+123,"negativeZero":-0,"array":[9007199254740993,1e999]},
  "steps":[
    {"stepId":"a","stepRunnerKey":"future:branch","note":"before","future":9007199254740993,"ifSteps":[{"stepId":"nested","stepRunnerKey":"sys:delay","future":-9223372036854775808}]},
    {"stepId":"b","stepRunnerKey":"sys:delay","future":9007199254740992}
  ],
  "variables":[{"id":"v","key":"value","future":9223372036854775807,"inputParamInfo":{"name":"Input","future":0.123456789012345678901}}],
  "subPrograms":[{"id":"sub","name":"Sub","kind":1e0,"stepCount":1e0,"future":9007199254740993,"steps":[{"stepId":"s","stepRunnerKey":"sys:delay","future":9223372036854775807}],"variables":[]}]
}`;

test("body edit, stable-ID step move and disk normalization retain opaque numeric lexemes", () => {
  const snapshot = parseProgramDocumentSnapshot(content);
  assert.equal(snapshot.subPrograms[0]?.kind, 1);
  assert.equal(snapshot.subPrograms[0]?.stepCount, 1);
  snapshot.steps[0]!.note = "after";
  const nested = snapshot.steps[0]!.ifSteps.shift()!;
  snapshot.steps = [snapshot.steps[1]!, snapshot.steps[0]!, nested];
  snapshot.variables[0]!.inputParamInfo!.isRequired = true;
  snapshot.subPrograms[0]!.steps[0]!.note = "sub edit";
  const saved = normalizeProgramWireForDisk(serializeProgramDocumentSnapshot(content, snapshot));
  const raw = parseLosslessJson(saved) as any;
  assert.equal(stringifyLosslessJson(raw.future), '{"int64":9223372036854775807,"precise":0.123456789012345678901,"exp":1.2300e+123,"negativeZero":-0,"array":[9007199254740993,1e999]}');
  assert.equal(stringifyLosslessJson(raw.steps.map((step: any) => step.future)), "[9007199254740992,9007199254740993,-9223372036854775808]");
  assert.equal(stringifyLosslessJson(raw.variables[0].inputParamInfo.future), "0.123456789012345678901");
  assert.equal(raw.variables[0].inputParamInfo.isRequired, true);
  assert.equal(stringifyLosslessJson(raw.subPrograms[0].steps[0].future), "9223372036854775807");
  assert.equal(parseProgramDocumentSnapshot(saved).steps[1]?.note, "after");
  assert.equal(normalizeProgramWireForDisk(saved), saved);
});

test("different unsafe integers, fractional lexemes and exponents cannot share a CAS fingerprint", () => {
  for (const [a, b] of [["9007199254740992", "9007199254740993"], ["0.123456789012345678901", "0.123456789012345678902"], ["1e3", "1000"], ["-0", "0"]]) {
    const make = (number: string) => `{"steps":[],"variables":[],"future":${number}}`;
    assert.notEqual(fingerprintProgramDocumentContent(make(a!)), fingerprintProgramDocumentContent(make(b!)));
  }
});

test("Agent transactions preserve numeric tokens while editing known body fields and reject stale revisions", () => {
  const session = createProgramDocumentSession({ identity: { documentKey: "fixture" }, content });
  const result = session.transact({ expectedRevision: 0, source: "agent", update: (raw) => { (raw.steps as any[])[0].note = "agent edit"; } });
  assert.equal(result.ok, true);
  assert.match(session.getState().content, /"int64": 9223372036854775807/);
  assert.match(session.getState().content, /"precise": 0\.123456789012345678901/);
  assert.equal(session.readSnapshot().steps[0]?.note, "agent edit");
  const stale = session.transact({ expectedRevision: 0, source: "agent", update: () => { throw new Error("must not run"); } });
  assert.equal(stale.ok, false);
  const ticket = session.beginSave(() => session.readSnapshot());
  assert.equal(ticket.ok, true);
  if (ticket.ok) {
    assert.match(normalizeProgramWireForDisk(ticket.ticket.content), /"int64": 9223372036854775807/);
    assert.equal(session.completeSave(ticket.ticket, { ok: true }).ok, true);
    assert.equal(session.getState().dirty, false);
  }
});

test("normalizer preserves opaque numbers at binding and default aliases without treating tokens as objects", () => {
  const raw = '{"steps":[{"stepId":"a","stepRunnerKey":"future:x","inputParams":{"future":9007199254740993,"legacy":{"value":9223372036854775807},"file":{"file":9007199254740993}}}],"variables":[{"id":"v","key":"x","defaultValue":9007199254740993}]}';
  const normalized = normalizeProgramWireForDisk(raw);
  assert.equal(stringifyLosslessJson(parseLosslessJson(normalized)), raw);
  assert.notEqual(fingerprintProgramDocumentContent(raw), fingerprintProgramDocumentContent(raw.replaceAll("9007199254740993", "9007199254740992")));
});

test("unknown array input bindings survive a body edit and disk normalization with their complete raw structure", () => {
  const original = '{"steps":[{"stepId":"s","stepRunnerKey":"future:x","note":"before","inputParams":{"futureArray":[9007199254740993,{"x":9223372036854775807,"nested":[-0,1.2300e+123]},["literal",null,true]]}}],"variables":[]}';
  const snapshot = parseProgramDocumentSnapshot(original);
  snapshot.steps[0]!.note = "after";
  const disk = normalizeProgramWireForDisk(serializeProgramDocumentSnapshot(original, snapshot));
  const expected = (parseLosslessJson(original) as any).steps[0].inputParams.futureArray;
  const actual = (parseLosslessJson(disk) as any).steps[0].inputParams.futureArray;
  assert.equal(Array.isArray(actual), true);
  assert.equal(stringifyLosslessJson(actual), stringifyLosslessJson(expected));
  assert.equal(normalizeProgramWireForDisk(disk), disk);
});

test("array bindings participate in CAS with nested shape, literal type and exact numeric lexemes", () => {
  const make = (value: string) => `{"steps":[{"stepId":"s","stepRunnerKey":"future:x","inputParams":{"futureArray":${value}}}],"variables":[]}`;
  for (const [left, right] of [
    ['[9007199254740992,{"x":1}]', '[9007199254740993,{"x":1}]'],
    ['[{"x":1}]', '[{"x":2}]'],
    ['["1,2"]', '[1,2]'],
    ['[null]', '[""]'],
  ]) assert.notEqual(fingerprintProgramDocumentContent(make(left!)), fingerprintProgramDocumentContent(make(right!)));
});

test("all four opaque variable-default array aliases survive body editing and disk normalization", () => {
  for (const alias of ["defaultValue", "default", "DefaultValue", "default_value"]) {
    const array = '["literal",9007199254740993,{"future":[9223372036854775807,0.123456789012345678901,-0]}]';
    const original = `{"steps":[],"variables":[{"id":"v","key":"x","${alias}":${array}}]}`;
    const snapshot = parseProgramDocumentSnapshot(original);
    snapshot.variables[0]!.desc = "edited description";
    const disk = normalizeProgramWireForDisk(serializeProgramDocumentSnapshot(original, snapshot));
    const variable = (parseLosslessJson(disk) as any).variables[0];
    assert.equal(variable.desc, "edited description");
    assert.equal(stringifyLosslessJson(variable[alias]), array, alias);
    assert.equal(normalizeProgramWireForDisk(disk), disk);
  }
});

test("all variable-default array aliases compare complete native numbers, structure and literal types for CAS", () => {
  for (const alias of ["defaultValue", "default", "DefaultValue", "default_value"]) {
    const make = (value: string) => `{"steps":[],"variables":[{"id":"v","key":"x","${alias}":${value}}]}`;
    for (const [left, right] of [
      ["[9007199254740992]", "[9007199254740993]"],
      ['[{"x":1}]', '[{"x":2}]'],
      ['["9007199254740993"]', "[9007199254740993]"],
      ['["a,b"]', '["a","b"]'],
    ]) assert.notEqual(fingerprintProgramDocumentContent(make(left!)), fingerprintProgramDocumentContent(make(right!)), alias);
  }
});
