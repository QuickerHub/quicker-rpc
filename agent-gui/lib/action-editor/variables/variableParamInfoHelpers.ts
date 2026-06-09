import {
  ActionVariable,
  type ActionVariableInputParamInfo,
  type ActionVariableOutputParamInfo,
} from "@/lib/action-editor/types/common";

export function defaultInputParamInfo(): ActionVariableInputParamInfo {
  return {
    inputMethod: 0,
    selectionItems: "",
    onlyUseSelect: false,
    isRequired: false,
    validationPattern: "",
    variableMode: 0,
    textTools: "",
    replaceMode: 0,
    isAdvanced: false,
    allowInput: false,
    multiLine: false,
    visibleExpression: "",
    skipEval: false,
  };
}

export function defaultOutputParamInfo(): ActionVariableOutputParamInfo {
  return { visibleExpression: "" };
}

export function ensureInputParamInfo(
  variable: ActionVariable,
): ActionVariableInputParamInfo {
  return variable.inputParamInfo
    ? { ...defaultInputParamInfo(), ...variable.inputParamInfo }
    : defaultInputParamInfo();
}

export function ensureOutputParamInfo(
  variable: ActionVariable,
): ActionVariableOutputParamInfo {
  return variable.outputParamInfo
    ? { ...defaultOutputParamInfo(), ...variable.outputParamInfo }
    : defaultOutputParamInfo();
}

/** Drop inputParamInfo when all meaningful flags are off/default. */
export function compactInputParamInfo(
  info: ActionVariableInputParamInfo | undefined,
): ActionVariableInputParamInfo | undefined {
  if (!info) return undefined;
  const hasValue =
    info.multiLine
    || info.isRequired
    || info.onlyUseSelect
    || info.isAdvanced
    || info.allowInput
    || info.skipEval
    || (info.selectionItems ?? "").trim().length > 0
    || (info.validationPattern ?? "").trim().length > 0
    || (info.visibleExpression ?? "").trim().length > 0
    || (info.textTools ?? "").trim().length > 0
    || info.inputMethod !== 0
    || info.variableMode !== 0
    || info.replaceMode !== 0;
  return hasValue ? info : undefined;
}

export function compactOutputParamInfo(
  info: ActionVariableOutputParamInfo | undefined,
): ActionVariableOutputParamInfo | undefined {
  if (!info) return undefined;
  return (info.visibleExpression ?? "").trim().length > 0 ? info : undefined;
}

export function patchInputParamInfo(
  variable: ActionVariable,
  patch: Partial<ActionVariableInputParamInfo>,
): ActionVariable {
  const next = { ...ensureInputParamInfo(variable), ...patch };
  return ActionVariable.fromPartial({
    ...variable,
    inputParamInfo: compactInputParamInfo(next),
  });
}

export function patchOutputParamInfo(
  variable: ActionVariable,
  patch: Partial<ActionVariableOutputParamInfo>,
): ActionVariable {
  const next = { ...ensureOutputParamInfo(variable), ...patch };
  return ActionVariable.fromPartial({
    ...variable,
    outputParamInfo: compactOutputParamInfo(next),
  });
}
