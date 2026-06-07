import { describe, expect, it } from "vitest";
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
  it("routes UseVar to VarOrValue editor", () => {
    expect(shouldUseVarOrValueEditor(def({ key: "x", variableMode: ParamVariableMode.UseVar }))).toBe(true);
  });

  it("routes UseVarOnly with empty value to variable-only picker", () => {
    const field = def({ key: "out", variableMode: ParamVariableMode.UseVarOnly });
    expect(shouldUseVariableOnlyPicker(field, param())).toBe(true);
    expect(shouldUseVarOrValueEditor(field)).toBe(false);
  });

  it("keeps UseVarOnly with expression value on VarOrValue path", () => {
    const field = def({ key: "out", variableMode: ParamVariableMode.UseVarOnly });
    expect(shouldUseVariableOnlyPicker(field, param("$=1+1"))).toBe(false);
    expect(shouldUseVarOrValueEditor(field, param("$=1+1"))).toBe(true);
  });

  it("detects texttools param key", () => {
    expect(isTextToolsParamKey("texttools")).toBe(true);
    expect(isTextToolsParamKey("TextTools")).toBe(true);
    expect(isTextToolsParamKey("other")).toBe(false);
  });

  it("routes boolean input to dedicated checkbox editor", () => {
    const field = def({ key: "flag", varType: CsVarType.Boolean, variableMode: ParamVariableMode.Input });
    expect(shouldUseVarOrValueEditor(field)).toBe(false);
  });
});
