import assert from "node:assert/strict";
import { test } from "node:test";
import { readStepRunnerInputContract, StepRunnerInputContractError } from "./step-runner-input-contract";

const expected = { hostKind: "v1" as const, stepRunnerKey: "sys:fixture" };
const input = () => ({ key: "text", policyKnown: true, varType: 0, variableMode: 0, allowInput: false,
  isControlField: false, visibilityResolved: true, visible: true, literalPolicy: "allowed", literalValueRestriction: "none", blockedReason: null, options: [] });
const contract = () => ({ version: 1, source: "runtime-definition", hostKind: "v1", stepRunnerKey: "sys:fixture",
  controlFieldKey: null, appliedControlFieldValue: null, visibilityResolved: true,
  reservedBindings: ["file", "varKey", ".file", ".var"], inputs: [input()] });

test("runtime input contracts preserve explicit zero, false and null without inferring UI defaults", () => {
  const raw = contract();
  const decoded = readStepRunnerInputContract(JSON.parse(JSON.stringify(raw)), expected);
  assert.equal(decoded.inputs[0]!.varType, 0);
  assert.equal(decoded.inputs[0]!.variableMode, 0);
  assert.equal(decoded.inputs[0]!.allowInput, false);
  assert.equal(decoded.inputs[0]!.isControlField, false);
  assert.equal(decoded.controlFieldKey, null);
  assert.equal(Object.isFrozen(decoded.inputs[0]), true);
  raw.inputs[0]!.key = "later mutation";
  assert.equal(decoded.inputs[0]!.key, "text");
  for (const name of Object.keys(input())) {
    const missing = contract() as unknown as { inputs: Record<string, unknown>[] };
    delete missing.inputs[0]![name];
    assert.throws(() => readStepRunnerInputContract(missing, expected), StepRunnerInputContractError, name);
  }
});

test("input contract identity, binding representation and ambiguous definitions fail closed", () => {
  for (const patch of [{ version: 2 }, { source: "static" }, { hostKind: "v2" }, { stepRunnerKey: "sys:other" },
    { appliedControlFieldValue: "without-control" }, { reservedBindings: ["file"] },
    { reservedBindings: ["file", "file", ".file", ".var"] }, { reservedBindings: ["file", "varKey", ".file", { toString: 5 }] }, { visibilityResolved: null },
    { inputs: [input(), { ...input(), key: "TEXT" }] }, { inputs: [{ ...input(), literalPolicy: "guess" }] },
    { inputs: [{ ...input(), variableMode: null }] }, { inputs: [{ ...input(), allowInput: 0 }] },
    { inputs: [{ ...input(), literalPolicy: { toString: 5 } }] }, { inputs: [{ ...input(), literalValueRestriction: "unknown" }] }]) {
    assert.throws(() => readStepRunnerInputContract({ ...contract(), ...patch }, expected), StepRunnerInputContractError);
  }
  for (const name of Object.keys(contract())) {
    const missing = contract() as unknown as Record<string, unknown>; delete missing[name];
    assert.throws(() => readStepRunnerInputContract(missing, expected), StepRunnerInputContractError, name);
  }
});

test("unknown native rows remain visibly blocked, including nullable raw policy facts", () => {
  const unknown = { ...input(), policyKnown: false, varType: null, variableMode: null, allowInput: null,
    isControlField: null, visibilityResolved: false, visible: false, literalPolicy: "unknown", literalValueRestriction: "unknown", blockedReason: "Native property unavailable" };
  const decoded = readStepRunnerInputContract({ ...contract(), visibilityResolved: false, inputs: [unknown] }, expected);
  assert.equal(decoded.inputs[0]!.varType, null);
  assert.equal(decoded.inputs[0]!.literalPolicy, "unknown");
  assert.equal(decoded.inputs[0]!.blockedReason, "Native property unavailable");
  const unresolvedVisibility = readStepRunnerInputContract({ ...contract(), visibilityResolved: false, inputs: [{ ...input(),
    visibilityResolved: false, visible: false, literalPolicy: "unknown", literalValueRestriction: "unknown", blockedReason: "INPUT_CONTEXT_REQUIRED" }] }, expected);
  assert.equal(unresolvedVisibility.inputs[0]!.policyKnown, true, "raw policy facts can be known while visibility still blocks editing");
  assert.equal(unresolvedVisibility.inputs[0]!.literalPolicy, "unknown");
  const negativeEnum = readStepRunnerInputContract({ ...contract(), inputs: [{ ...unknown, varType: -1 }] }, expected);
  assert.equal(negativeEnum.inputs[0]!.varType, -1, "unsupported raw enums remain facts of an explicitly blocked row");
  assert.throws(() => readStepRunnerInputContract({ ...contract(), inputs: [{ ...unknown, literalPolicy: "allowed" }] }, expected));
});

test("conditional literal permission and closed option values remain independent native facts", () => {
  const decoded = readStepRunnerInputContract({ ...contract(), inputs: [{ ...input(), variableMode: 3,
    literalPolicy: "existing-nonempty-literal-only", literalValueRestriction: "options", options: ["A", "B"] }] }, expected);
  assert.equal(decoded.inputs[0]!.literalPolicy, "existing-nonempty-literal-only");
  assert.equal(decoded.inputs[0]!.literalValueRestriction, "options");
  assert.deepEqual(decoded.inputs[0]!.options, ["A", "B"]);
});

test("existing literal policies retain native modes and resolved control values without reclassifying them", () => {
  const decoded = readStepRunnerInputContract({ ...contract(), controlFieldKey: "operation", appliedControlFieldValue: "Start",
    inputs: [input(), { ...input(), key: "legacy", variableMode: 2, literalPolicy: "existing-literal-only" },
      { ...input(), key: "legacyNonempty", variableMode: 3, literalPolicy: "existing-nonempty-literal-only" }] }, expected);
  assert.equal(decoded.appliedControlFieldValue, "Start");
  assert.deepEqual(decoded.inputs.map((row) => [row.variableMode, row.literalPolicy]),
    [[0, "allowed"], [2, "existing-literal-only"], [3, "existing-nonempty-literal-only"]]);
});
