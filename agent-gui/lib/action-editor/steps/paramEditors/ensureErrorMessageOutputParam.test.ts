import assert from "node:assert/strict";
import { test } from "node:test";
import { StepRunnerItem, StepRunnerOutputParamDef } from "../../types/action_query";
import { mapAgentSchemaToStepRunnerItem } from "../../api/stepRunnerSchemaMap";
import catalog from "../../data/step-runners-ui-catalog.json";
import { CsVarType } from "./csStepEnums";
import { ensureErrorMessageOutputParam } from "./ensureErrorMessageOutputParam";

test("native isSuccess modules gain the shared Text error output without mutating the bound UI catalog", () => {
  const runner = mapAgentSchemaToStepRunnerItem(catalog.schemas["sys:openUrl"]);
  const before = JSON.stringify(runner);
  assert.equal(runner.outputParamDefs.some((def) => def.key === "isSuccess"), true);
  assert.equal(runner.outputParamDefs.some((def) => def.key === "errMessage"), false);
  const projected = ensureErrorMessageOutputParam(runner)!;
  assert.notEqual(projected, runner);
  assert.equal(JSON.stringify(runner), before);
  assert.equal(projected.inputParamDefs, runner.inputParamDefs);
  const error = projected.outputParamDefs.at(-1)!;
  assert.equal(error.key, "errMessage"); assert.equal(error.name, "错误消息");
  assert.equal(error.varType, CsVarType.Text); assert.equal(error.isAdvanced, false);
  assert.deepEqual(error.validForList, []); assert.deepEqual(error.invalidForList, []);
  assert.equal(ensureErrorMessageOutputParam(projected), projected, "repeated projection never duplicates the output");
});

test("group modules retain their distinct errorMessage and modules without isSuccess gain no guessed outputs", () => {
  const group = StepRunnerItem.fromPartial({ key: "sys:group", outputParamDefs: [
    { key: "isSuccess", varType: CsVarType.Boolean }, { key: "errorMessage", varType: CsVarType.Text },
  ] });
  assert.equal(ensureErrorMessageOutputParam(group), group);
  for (const runner of [StepRunnerItem.fromPartial({ key: "sys:other" }),
    StepRunnerItem.fromPartial({ key: "sys:other", outputParamDefs: [{ key: "success", varType: CsVarType.Boolean }] })])
    assert.equal(ensureErrorMessageOutputParam(runner), runner);
  assert.equal(ensureErrorMessageOutputParam(undefined), undefined);
});

test("existing native/plugin error definitions and all UI schema extensions remain authoritative", () => {
  const runner = mapAgentSchemaToStepRunnerItem(catalog.schemas["sys:whiteboard"]);
  Object.assign(runner, { futureRunnerField: { keep: true } });
  Object.assign(runner.inputParamDefs[0], { futureInputField: "keep", newStepDefaultValue: "explicit-only" });
  const projected = ensureErrorMessageOutputParam(runner)!;
  assert.notEqual(projected, runner);
  assert.equal(projected.outputParamDefs.some((def) => def.key === "errMessage"), true);
  assert.equal(projected.inputParamDefs, runner.inputParamDefs);
  assert.equal((projected as typeof runner & { futureRunnerField: unknown }).futureRunnerField,
    (runner as typeof runner & { futureRunnerField: unknown }).futureRunnerField);
  assert.equal(projected.inputParamDefs.some((def) => (def as typeof def & { textTools?: string }).textTools === "ColorPickerArgb"), true);
  assert.equal((projected.inputParamDefs[0] as typeof runner.inputParamDefs[0] & { futureInputField: string }).futureInputField, "keep");
  const custom = StepRunnerOutputParamDef.fromPartial({ key: "errMessage", name: "插件错误", isAdvanced: true, validForList: ["native"] });
  const existing = { ...runner, outputParamDefs: [...runner.outputParamDefs, custom] };
  assert.equal(ensureErrorMessageOutputParam(existing), existing);
  assert.equal(existing.outputParamDefs.at(-1), custom);
});
