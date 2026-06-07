import type { ActionVariable } from "@/lib/action-editor/types/common";
import { CsVarType } from "./csStepEnums";
import { isStepParamVarAssignable } from "./stepParamVarAssign";

export const STEP_PARAM_BUILTIN_CLIP_TEXT_KEY = "[cliptext]";
export const STEP_PARAM_BUILTIN_QUICKER_IN_PARAM_KEY = "quicker_in_param";
export const STEP_PARAM_CREATE_VARIABLE_ROW_ID = "__create_variable__";

function buildBuiltinPseudoVariable(key: string, desc: string): ActionVariable {
  return ActionVariable.create({
    id: `builtin-${key}`,
    key,
    varType: CsVarType.Text,
    defaultValue: "",
    desc,
    isLocked: false,
    saveState: false,
    isInput: false,
    isOutput: false,
    paramName: "",
    group: "",
    customType: "",
  });
}

/** Pseudo variables shown when Text is assignable to the param (WPF VarAndValue / VariableParamSelector). */
export function buildStepParamBuiltinPseudoVariables(targetVarType: number): ActionVariable[] {
  if (!isStepParamVarAssignable(CsVarType.Text, targetVarType)) {
    return [];
  }
  return [
    buildBuiltinPseudoVariable(STEP_PARAM_BUILTIN_CLIP_TEXT_KEY, "*剪贴板文本*"),
    buildBuiltinPseudoVariable(STEP_PARAM_BUILTIN_QUICKER_IN_PARAM_KEY, "*动作参数*"),
  ];
}

export function enrichStepParamVariableCandidates(
  variables: readonly ActionVariable[],
  targetVarType: number,
): ActionVariable[] {
  const seen = new Set(
    variables
      .map((v) => (v.key ?? "").trim())
      .filter((k) => k.length > 0),
  );
  const merged = [...variables];
  for (const pseudo of buildStepParamBuiltinPseudoVariables(targetVarType)) {
    const key = (pseudo.key ?? "").trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(pseudo);
  }
  return merged;
}
