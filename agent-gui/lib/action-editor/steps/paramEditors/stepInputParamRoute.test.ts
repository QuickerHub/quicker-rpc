import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ActionStepParam } from "@/lib/action-editor/types/common";
import type { StepRunnerInputParamDef } from "@/lib/action-editor/types/action_query";
import { CsVarType, ParamVariableMode } from "./csStepEnums";
import {
  isTextToolsParamKey,
  shouldUseVarOrValueEditor,
  shouldUseVariableOnlyPicker,
} from "./stepInputParamRoute";

function def(partial: Partial<StepRunnerInputParamDef> & { key: string }): StepRunnerInputParamDef {
  return {
    key: partial.key,
    name: partial.name ?? partial.key,
    varType: partial.varType ?? CsVarType.Text,
    variableMode: partial.variableMode ?? ParamVariableMode.Input,
    selectionItems: partial.selectionItems,
    description: partial.description ?? "",
    defaultValue: partial.defaultValue ?? "",
    isControlField: partial.isControlField ?? false,
    isMultiLine: partial.isMultiLine ?? false,
    validFor: partial.validFor,
    invalidFor: partial.invalidFor,
    visibleExpression: partial.visibleExpression,
  };
}

function param(value = "", varKey = ""): ActionStepParam {
  return { value, varKey };
}

describe("stepInputParamRoute", () => {
  test("routes UseVar to VarOrValue editor", () => {
    assert.equal(
      shouldUseVarOrValueEditor(def({ key: "x", variableMode: ParamVariableMode.UseVar })),
      true,
    );
  });

  test("routes UseVarOnly with empty value to variable-only picker", () => {
    const field = def({ key: "out", variableMode: ParamVariableMode.UseVarOnly });
    assert.equal(shouldUseVariableOnlyPicker(field, param()), true);
    assert.equal(shouldUseVarOrValueEditor(field), false);
  });

  test("keeps UseVarOnly with expression value on VarOrValue path", () => {
    const field = def({ key: "out", variableMode: ParamVariableMode.UseVarOnly });
    assert.equal(shouldUseVariableOnlyPicker(field, param("$=1+1")), false);
    assert.equal(shouldUseVarOrValueEditor(field, param("$=1+1")), true);
  });

  test("detects texttools param key", () => {
    assert.equal(isTextToolsParamKey("texttools"), true);
    assert.equal(isTextToolsParamKey("TextTools"), true);
    assert.equal(isTextToolsParamKey("other"), false);
  });

  test("routes boolean input to dedicated checkbox editor", () => {
    const field = def({ key: "flag", varType: CsVarType.Boolean, variableMode: ParamVariableMode.Input });
    assert.equal(shouldUseVarOrValueEditor(field), false);
  });
});
