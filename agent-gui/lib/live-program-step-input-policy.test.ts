import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectLiveProgramStepInputPolicy, isSupportedLiveStepLiteral } from "./live-program-step-input-policy";
import { readStepRunnerInputContract } from "./step-runner-input-contract";

const content = '{"steps":[{"stepId":"one","stepRunnerKey":"sys:fixture","inputParams":{"text":"old","empty":"","closed":"first","bound":"@var:x","external":"@file:x","typed":false,"aliases":{"value":"a","Value":"b"},"dynamic":"$=1","money":"20$","format":"a\\u200db","nfkc":"＄","escaped":"@value:@var:literal"}}],"variables":[],"subPrograms":[]}';
function schema(patch: object = {}) {
  const row = (key: string, extra = {}) => ({ key, policyKnown: true, varType: 0, variableMode: 0, allowInput: false, isControlField: false,
    visibilityResolved: true, visible: true, literalPolicy: "allowed", literalValueRestriction: "none", blockedReason: null, options: [], ...extra });
  return readStepRunnerInputContract({ version: 1, source: "runtime-definition", hostKind: "v1", stepRunnerKey: "sys:fixture",
    controlFieldKey: null, appliedControlFieldValue: null, visibilityResolved: true, reservedBindings: ["file", "varKey", ".file", ".var"],
    inputs: ["text", "empty", "closed", "bound", "external", "typed", "aliases", "dynamic", "money", "format", "nfkc", "escaped"].map((key) => row(key)), ...patch },
  { hostKind: "v1", stepRunnerKey: "sys:fixture" });
}
test("editable keys require exact existing raw literals, not bindings typed values aliases or dynamic data", () => {
  const policy = inspectLiveProgramStepInputPolicy(content, "one", "sys:fixture", schema());
  assert.deepEqual(policy.editableInputKeys, ["text", "empty", "closed", "escaped"]);
  assert.equal(policy.validateChanges([{ key: "escaped", value: "@file:literal" }]).has("escaped"), true);
  for (const key of ["bound", "external", "typed", "aliases", "dynamic", "money", "format", "nfkc", "new", "TEXT"])
    assert.throws(() => policy.validateChanges([{ key, value: "next" }]));
});
test("native value conditions use the prior Value; a nonempty mode3 literal can be cleared", () => {
  const native = schema(); const rows = structuredClone(native.inputs);
  for (const row of rows) { (row as { variableMode: number }).variableMode = 3; (row as { literalPolicy: string }).literalPolicy = "existing-nonempty-literal-only"; }
  const policy = inspectLiveProgramStepInputPolicy(content, "one", "sys:fixture", { ...native, inputs: rows });
  assert.equal(policy.editableInputKeys.includes("empty"), false);
  assert.doesNotThrow(() => policy.validateChanges([{ key: "text", value: "" }]));
  (rows[1] as { variableMode: number }).variableMode = 2;
  (rows[1] as { literalPolicy: string }).literalPolicy = "existing-literal-only";
  assert.doesNotThrow(() => inspectLiveProgramStepInputPolicy(content, "one", "sys:fixture", { ...native, inputs: rows })
    .validateChanges([{ key: "empty", value: "now nonempty" }]));
  for (const value of ["$", "$=1", "$$hi", "＄=1", "a\u200db", "\ufeffword", "50$"])
    assert.equal(isSupportedLiveStepLiteral(value), false, value);
});
test("native closed selections and noncontrol visibility facts stay separate from value conditions", () => {
  const native = schema(); const rows = structuredClone(native.inputs);
  (rows[0] as { isControlField: boolean }).isControlField = true;
  (rows[1] as { visibilityResolved: boolean }).visibilityResolved = false;
  const selected = rows[2] as { literalValueRestriction: string; options: string[] };
  selected.literalValueRestriction = "options"; selected.options = ["first", "next"];
  const policy = inspectLiveProgramStepInputPolicy(content, "one", "sys:fixture", { ...native, inputs: rows });
  assert.deepEqual(policy.editableInputKeys, ["closed", "escaped"]);
  assert.doesNotThrow(() => policy.validateChanges([{ key: "closed", value: "next" }]));
  assert.throws(() => policy.validateChanges([{ key: "closed", value: "NEXT" }]));
  assert.throws(() => policy.validateChanges([{ key: "closed", value: "other" }]));
  const contradictory = inspectLiveProgramStepInputPolicy(content, "one", "sys:fixture", { ...native, controlFieldKey: "text" });
  assert.equal(contradictory.editableInputKeys.includes("text"), false);
});
test("batch validation rejects duplicate or injected shape and never creates a missing value", () => {
  const policy = inspectLiveProgramStepInputPolicy(content, "one", "sys:fixture", schema());
  for (const changes of [[], [{ key: "text", value: "a" }, { key: "text", value: "b" }],
    [{ key: "text", value: "a", file: "x" }], [{ key: "new", value: "x" }]])
    assert.throws(() => policy.validateChanges(changes));
  assert.throws(() => inspectLiveProgramStepInputPolicy(content, "one", "sys:other", schema()));
});
