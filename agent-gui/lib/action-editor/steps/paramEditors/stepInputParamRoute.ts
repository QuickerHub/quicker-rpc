import type { ActionStepParam } from "@/lib/action-editor/types/common";
import type { StepRunnerInputParamDef } from "@/lib/action-editor/types/action_query";
import { CsVarType, ParamVariableMode } from "./csStepEnums";

export function isTextToolsParamKey(key: string): boolean {
  return (key ?? "").trim().toLowerCase() === "texttools";
}

/** Mirrors WPF InputParamEditorControl: Input is checkbox/enum-only; UseVar uses VarAndValue. */
export function shouldUseVarOrValueEditor(
  def: StepRunnerInputParamDef,
  param?: ActionStepParam,
): boolean {
  const vm = def.variableMode;
  if (vm === ParamVariableMode.UseVarOrInput || vm === ParamVariableMode.UseVar) {
    return true;
  }
  if (vm === ParamVariableMode.UseVarOnly) {
    return (param?.value ?? "").trim().length > 0;
  }
  if (vm !== ParamVariableMode.Input) {
    return false;
  }
  const vt = def.varType;
  if (vt === CsVarType.Boolean) {
    return false;
  }
  if (vt === CsVarType.Enum && (def.selectionItems?.length ?? 0) > 0) {
    return false;
  }
  if (vt === CsVarType.Form || vt === CsVarType.FormForDict) {
    return false;
  }
  return true;
}

/**
 * UseVarOnly + empty value → variable-only picker (WPF VariableParamSelector).
 * Non-empty value keeps VarAndValue so legacy expressions remain editable.
 */
export function shouldUseVariableOnlyPicker(
  def: StepRunnerInputParamDef,
  param: ActionStepParam,
): boolean {
  if (def.variableMode !== ParamVariableMode.UseVarOnly) {
    return false;
  }
  return (param.value ?? "").trim().length === 0;
}
