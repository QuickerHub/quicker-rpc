import assert from "node:assert/strict";
import { test } from "node:test";
import { fingerprintProgramDocumentContent, parseProgramDocumentSnapshot, serializeProgramDocumentSnapshot } from "./programDocumentWire";

test("lean document fields remain in their source namespace through ordinary edits and removals", () => {
  const content = '{"steps":[{"key":"sys:notify","inputs":{"msg":{"Value":"before","future":9223372036854775807},"remove":"old"},"outputs":{"result":"old"},"future":1.0000000000000001,"ifSteps":[{"key":"sys:delay","inputs":{"ms":"1"}}]}],"variables":[]}';
  const snapshot = parseProgramDocumentSnapshot(content);
  assert.equal(serializeProgramDocumentSnapshot(content, snapshot), content, "reading must not persist synthetic IDs or rename aliases");
  snapshot.steps[0]!.stepRunnerKey = "sys:future-notify";
  snapshot.steps[0]!.inputParams.msg!.value = "after";
  delete snapshot.steps[0]!.inputParams.remove;
  snapshot.steps[0]!.outputParams = {};
  snapshot.steps[0]!.ifSteps[0]!.inputParams.ms!.value = "2";
  const changed = serializeProgramDocumentSnapshot(content, snapshot), saved = JSON.parse(changed).steps[0];
  assert.equal(saved.key, "sys:future-notify"); assert.equal(saved.inputs.msg.value, "after");
  assert.equal(Object.hasOwn(saved.inputs, "remove"), false); assert.deepEqual(saved.outputs, {});
  assert.equal(saved.ifSteps[0].inputs.ms, "2");
  for (const key of ["stepRunnerKey", "inputParams", "outputParams"]) assert.equal(Object.hasOwn(saved, key), false, key);
  assert.match(changed, /9223372036854775807/); assert.match(changed, /1\.0000000000000001/);
  const again = parseProgramDocumentSnapshot(changed);
  assert.equal(again.steps[0]!.inputParams.msg!.value, "after");
  assert.equal(serializeProgramDocumentSnapshot(changed, again), changed);
});

test("lean and canonical fingerprints agree while native parameter extensions still participate", () => {
  const lean = '{"steps":[{"key":"sys:notify","inputs":{"msg":{"Value":"same","future":9223372036854775807}},"outputs":{"result":"old"}}],"variables":[]}';
  const canonical = lean.replace('"key":', '"stepRunnerKey":').replace('"inputs":', '"inputParams":').replace('"outputs":', '"outputParams":');
  assert.equal(fingerprintProgramDocumentContent(lean), fingerprintProgramDocumentContent(canonical));
  assert.notEqual(fingerprintProgramDocumentContent(lean), fingerprintProgramDocumentContent(lean.replace("9223372036854775807", "9223372036854775806")));
  const snapshot = parseProgramDocumentSnapshot(lean);
  snapshot.steps[0]!.note = "unrelated edit";
  const saved = JSON.parse(serializeProgramDocumentSnapshot(lean, snapshot)).steps[0];
  assert.deepEqual(saved.inputs, JSON.parse(lean).steps[0].inputs, "unrelated edits leave binding representation intact");
});

function nativeFixture() {
  return {
    futureProgram: { enabled: true },
    files: { "files/body.cs": { futureFile: "opaque" } },
    steps: [{
      stepId: "branch", stepRunnerKey: "future:branch", futureStep: { token: 7 }, note: "remove me", disabled: true,
      inputParams: { "script.file": "files/body.cs", extension: { value: "old", futureParam: { kept: true } } },
      ifSteps: [{ stepId: "nested", stepRunnerKey: "sys:delay", inputParams: { ms: "10" }, futureNested: [1, 2] }],
    }],
    variables: [{ id: "v", key: "text", "default.file": "files/default.txt", futureVariable: true, inputParamInfo: { futureInfo: { n: 1 }, name: "x" } }],
    subPrograms: [{
      id: "sub", name: "Sub", kind: 1, futureSub: { color: "opaque" }, stepCount: 99,
      steps: [{ stepId: "ss", stepRunnerKey: "sys:delay", inputParams: { ms: "20" }, futureSubStep: true }],
      variables: [{ id: "sv", key: "subText", "default.file": "files/sub-default.txt", futureSubVariable: true }],
      subPrograms: [{ id: "inner", name: "Inner", futureInner: true, steps: [], variables: [] }],
    }],
  };
}

test("document wire no-op retains original formatting, unknowns, legacy defaults and generated ids", () => {
  const content = JSON.stringify({
    steps: [{ stepRunnerKey: "future:branch", ifSteps: [{ stepRunnerKey: "sys:delay" }], future: true }],
    variables: [{ key: "text", defaultValueFile: "files/default.txt" }],
    subPrograms: [{ id: "s", name: "Sub", stepCount: 99, variables: [{ key: "sub", "default.file": "files/sub.txt" }] }],
  });
  const snapshot = parseProgramDocumentSnapshot(content);
  assert.ok(snapshot.steps[0]?.stepId);
  assert.ok(snapshot.variables[0]?.id);
  assert.equal((snapshot.subPrograms[0]?.variables[0] as { defaultValueFile?: string }).defaultValueFile, "files/sub.txt");
  assert.equal(snapshot.subPrograms[0]!.stepCount, 99);
  assert.equal(serializeProgramDocumentSnapshot(content, snapshot), content);
});

test("document wire edits preserve unknown runner branches, step/parameter/variable/file and nested subprogram fields", () => {
  const content = JSON.stringify(nativeFixture());
  const snapshot = parseProgramDocumentSnapshot(content);
  snapshot.steps[0]!.note = "changed";
  snapshot.steps[0]!.inputParams.extension!.value = "new";
  snapshot.steps[0]!.ifSteps[0]!.inputParams.ms!.value = "11";
  snapshot.variables[0]!.desc = "new description";
  snapshot.variables[0]!.inputParamInfo!.isRequired = true;
  snapshot.subPrograms[0]!.steps[0]!.inputParams.ms!.value = "21";
  snapshot.subPrograms[0]!.subPrograms[0]!.description = "nested changed";
  const saved = JSON.parse(serializeProgramDocumentSnapshot(content, snapshot));
  assert.deepEqual(saved.futureProgram, { enabled: true });
  assert.deepEqual(saved.files, nativeFixture().files);
  assert.deepEqual(saved.steps[0].futureStep, { token: 7 });
  assert.equal(saved.steps[0].inputParams["script.file"], "files/body.cs");
  assert.deepEqual(saved.steps[0].inputParams.extension, { futureParam: { kept: true }, value: "new" });
  assert.equal(saved.steps[0].ifSteps[0].inputParams.ms, "11");
  assert.deepEqual(saved.steps[0].ifSteps[0].futureNested, [1, 2]);
  assert.equal(saved.variables[0]["default.file"], "files/default.txt");
  assert.equal(saved.variables[0].futureVariable, true);
  assert.deepEqual(saved.variables[0].inputParamInfo.futureInfo, { n: 1 });
  assert.equal(saved.variables[0].inputParamInfo.isRequired, true);
  assert.equal(saved.subPrograms[0].futureSub.color, "opaque");
  assert.equal(saved.subPrograms[0].steps[0].futureSubStep, true);
  assert.equal(saved.subPrograms[0].variables[0]["default.file"], "files/sub-default.txt");
  assert.equal(saved.subPrograms[0].variables[0].futureSubVariable, true);
  assert.equal(saved.subPrograms[0].stepCount, 1);
  assert.equal(saved.subPrograms[0].subPrograms[0].futureInner, true);
});

test("document wire explicit known-field and node removal does not resurrect baseline values", () => {
  const content = JSON.stringify(nativeFixture());
  const snapshot = parseProgramDocumentSnapshot(content);
  snapshot.steps[0]!.note = "";
  snapshot.steps[0]!.disabled = false;
  snapshot.steps[0]!.ifSteps = [];
  delete snapshot.steps[0]!.inputParams.script;
  delete (snapshot.variables[0] as { defaultValueFile?: string }).defaultValueFile;
  snapshot.variables[0]!.defaultValue = "inline";
  snapshot.subPrograms[0]!.subPrograms = [];
  const saved = JSON.parse(serializeProgramDocumentSnapshot(content, snapshot));
  for (const key of ["note", "disabled", "ifSteps"]) assert.equal(Object.hasOwn(saved.steps[0], key), false, key);
  assert.equal(Object.hasOwn(saved.steps[0].inputParams, "script.file"), false);
  assert.equal(Object.hasOwn(saved.variables[0], "default.file"), false);
  assert.equal(saved.variables[0].default, "inline");
  assert.deepEqual(saved.subPrograms[0].subPrograms, []);
  assert.deepEqual(saved.steps[0].futureStep, { token: 7 });
});

test("document wire matches moved steps by stable identity across branches rather than array position", () => {
  const content = JSON.stringify({
    steps: [{ stepId: "parent", stepRunnerKey: "sys:if", ifSteps: [
      { stepId: "a", stepRunnerKey: "sys:delay", note: "A", future: "A" },
      { stepId: "b", stepRunnerKey: "sys:delay", note: "B", future: "B" },
    ] }], variables: [],
  });
  const snapshot = parseProgramDocumentSnapshot(content);
  const [a, b] = snapshot.steps[0]!.ifSteps;
  snapshot.steps[0]!.ifSteps = [b!];
  snapshot.steps.push(a!);
  const saved = JSON.parse(serializeProgramDocumentSnapshot(content, snapshot));
  assert.equal(saved.steps[0].ifSteps[0].future, "B");
  assert.equal(saved.steps[1].future, "A");
});

test("document wire persists normalized ids only after a real edit and preserves unknowns through subsequent reorders", () => {
  let content = JSON.stringify({ steps: [
    { stepRunnerKey: "sys:delay", note: "A", future: "A" },
    { stepRunnerKey: "sys:delay", note: "B", future: "B" },
  ], variables: [{ key: "value", future: "variable" }] });
  const snapshot = parseProgramDocumentSnapshot(content);
  snapshot.steps.reverse();
  content = serializeProgramDocumentSnapshot(content, snapshot);
  const next = parseProgramDocumentSnapshot(content);
  next.steps[0]!.note = "B edited";
  const saved = JSON.parse(serializeProgramDocumentSnapshot(content, next));
  assert.equal(saved.steps[0].future, "B");
  assert.equal(saved.steps[1].future, "A");
  assert.ok(saved.steps[0].stepId);
  assert.ok(saved.variables[0].id);
  assert.equal(saved.variables[0].future, "variable");
});

test("document wire rejects duplicate nested step identity instead of attaching unknowns to an arbitrary row", () => {
  const content = JSON.stringify(nativeFixture());
  const snapshot = parseProgramDocumentSnapshot(content);
  snapshot.steps[0]!.ifSteps.push(structuredClone(snapshot.steps[0]!.ifSteps[0]!));
  assert.throws(() => serializeProgramDocumentSnapshot(content, snapshot), /Duplicate stepId/);
});

test("legacy default object extensions survive description edits and file-to-inline-to-file changes", () => {
  let content = JSON.stringify({ steps: [], variables: [{ id: "v", key: "text", defaultValue: { file: "files/a.txt", futureDefault: { x: 1 } } }] });
  let snapshot = parseProgramDocumentSnapshot(content);
  snapshot.variables[0]!.desc = "description edited";
  content = serializeProgramDocumentSnapshot(content, snapshot);
  assert.deepEqual(JSON.parse(content).variables[0].defaultValue, { file: "files/a.txt", futureDefault: { x: 1 } });
  snapshot = parseProgramDocumentSnapshot(content);
  delete (snapshot.variables[0] as { defaultValueFile?: string }).defaultValueFile;
  snapshot.variables[0]!.defaultValue = "inline";
  content = serializeProgramDocumentSnapshot(content, snapshot);
  let saved = JSON.parse(content).variables[0];
  assert.equal(saved.default, "inline");
  assert.equal(Object.hasOwn(saved, "default.file"), false);
  assert.deepEqual(saved.defaultValue, { futureDefault: { x: 1 } });
  snapshot = parseProgramDocumentSnapshot(content);
  snapshot.variables[0]!.defaultValue = "";
  (snapshot.variables[0] as { defaultValueFile?: string }).defaultValueFile = "files/b.txt";
  saved = JSON.parse(serializeProgramDocumentSnapshot(content, snapshot)).variables[0];
  assert.equal(saved["default.file"], "files/b.txt");
  assert.equal(Object.hasOwn(saved, "default"), false);
  assert.deepEqual(saved.defaultValue, { futureDefault: { x: 1 } });
});

test("an opaque default object without a recognized binding survives adding a file default", () => {
  const content = JSON.stringify({ steps: [], variables: [{ id: "v", key: "text", defaultValue: { futureDefault: { x: 1 } } }] });
  const snapshot = parseProgramDocumentSnapshot(content);
  (snapshot.variables[0] as { defaultValueFile?: string }).defaultValueFile = "files/a.txt";
  const saved = JSON.parse(serializeProgramDocumentSnapshot(content, snapshot)).variables[0];
  assert.equal(saved["default.file"], "files/a.txt");
  assert.deepEqual(saved.defaultValue, { futureDefault: { x: 1 } });
});

test("table field extensions follow fieldKey through reordering, insertion and explicit removal", () => {
  const content = JSON.stringify({ steps: [], variables: [{ id: "v", key: "table", tableDef: { fields: [
    { fieldKey: "a", label: "A", futureColumn: "A" }, { fieldKey: "b", label: "B", futureColumn: "B" },
  ] } }] });
  const snapshot = parseProgramDocumentSnapshot(content);
  const fields = snapshot.variables[0]!.tableDef!.fields;
  const added = { ...structuredClone(fields[0]!), fieldKey: "c", label: "C" };
  snapshot.variables[0]!.tableDef!.fields = [fields[1]!, added, fields[0]!];
  let saved = JSON.parse(serializeProgramDocumentSnapshot(content, snapshot));
  assert.deepEqual(saved.variables[0].tableDef.fields.map((field: { fieldKey: string; futureColumn?: string }) => [field.fieldKey, field.futureColumn]), [["b", "B"], ["c", undefined], ["a", "A"]]);
  const next = parseProgramDocumentSnapshot(JSON.stringify(saved));
  next.variables[0]!.tableDef!.fields = [next.variables[0]!.tableDef!.fields[2]!];
  saved = JSON.parse(serializeProgramDocumentSnapshot(JSON.stringify(saved), next));
  assert.equal(saved.variables[0].tableDef.fields.length, 1);
  assert.equal(saved.variables[0].tableDef.fields[0].futureColumn, "A");
});

test("opaque default aliases retain their original namespace through known file and inline binding edits", () => {
  for (const alias of ["default", "DefaultValue", "default_value"]) {
    let content = JSON.stringify({ steps: [], variables: [{ id: "v", key: "text", [alias]: { file: "opaque-file-member", futureDefault: { x: 1 } } }] });
    let snapshot = parseProgramDocumentSnapshot(content);
    snapshot.variables[0]!.desc = "description changed";
    content = serializeProgramDocumentSnapshot(content, snapshot);
    assert.deepEqual(JSON.parse(content).variables[0][alias], { file: "opaque-file-member", futureDefault: { x: 1 } }, alias);
    snapshot = parseProgramDocumentSnapshot(content);
    (snapshot.variables[0] as { defaultValueFile?: string }).defaultValueFile = "files/current.txt";
    content = serializeProgramDocumentSnapshot(content, snapshot);
    assert.equal(JSON.parse(content).variables[0]["default.file"], "files/current.txt", alias);
    assert.deepEqual(JSON.parse(content).variables[0][alias], { file: "opaque-file-member", futureDefault: { x: 1 } }, alias);
    snapshot = parseProgramDocumentSnapshot(content);
    delete (snapshot.variables[0] as { defaultValueFile?: string }).defaultValueFile;
    snapshot.variables[0]!.defaultValue = "new inline";
    if (alias === "default") {
      assert.throws(() => serializeProgramDocumentSnapshot(content, snapshot), /Cannot replace opaque variable default object/);
    } else {
      const saved = JSON.parse(serializeProgramDocumentSnapshot(content, snapshot)).variables[0];
      assert.equal(saved.default, "new inline", alias);
      assert.deepEqual(saved[alias], { file: "opaque-file-member", futureDefault: { x: 1 } }, alias);
      assert.equal(Object.hasOwn(saved, "default.file"), false, alias);
    }
  }
});
