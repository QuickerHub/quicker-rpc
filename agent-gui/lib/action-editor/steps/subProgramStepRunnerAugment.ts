import type { ActionVariable } from "@/lib/action-editor/types/common";
import { StepRunnerInputParamDef, StepRunnerItem, StepRunnerOutputParamDef } from "@/lib/action-editor/types/action_query";
import { actionVariableRowKey } from "../variables/actionVariableUi";
import { CsVarType, ParamVariableMode } from "./paramEditors/csStepEnums";
import { parseSelectionItemsText } from "./parseSelectionItemsText";

const HIDDEN_SUBPROGRAM_RUNNER_INPUT_KEYS = new Set(["subProgram", "summary"]);

function actionVariableToSubProgramStepInputDef(v: ActionVariable): StepRunnerInputParamDef {
  const keyName = (v.key ?? "").trim();
  const ip = v.inputParamInfo;
  let varType = v.varType ?? CsVarType.Text;
  let variableMode: number = ParamVariableMode.UseVarOrInput;
  const selectionRaw = (ip?.selectionItems ?? "").trim();
  const selectionItems =
    selectionRaw.length > 0 ? parseSelectionItemsText(selectionRaw) : [];

  // Mirrors SubProgramStepHelpers.CreateStepInParam.
  if (selectionItems.length > 0 && ip?.onlyUseSelect) {
    variableMode = ParamVariableMode.Input;
    varType = CsVarType.Enum;
  }

  return StepRunnerInputParamDef.fromPartial({
    key: `var:${keyName}`,
    name: (v.paramName ?? "").trim() || keyName,
    description: (v.desc ?? "").trim(),
    varType,
    variableMode,
    isMultiLine: Boolean(ip?.multiLine),
    isRequired: Boolean(ip?.isRequired),
    isAdvanced: Boolean(ip?.isAdvanced),
    defaultValue: v.defaultValue ?? "",
    validationPattern: (ip?.validationPattern ?? "").trim(),
    visibleExpression: (ip?.visibleExpression ?? "").trim(),
    allowInput: ip?.allowInput ?? true,
    replaceVariable: false,
    skipEval: Boolean(ip?.skipEval),
    skipLogContent: false,
    isControlField: false,
    fromOldField: "",
    defaultHighlightType: "",
    selectionItems,
    validForList: [],
    invalidForList: []
  });
}

function actionVariableToSubProgramStepOutputDef(v: ActionVariable): StepRunnerOutputParamDef {
  const keyName = (v.key ?? "").trim();
  const op = v.outputParamInfo;
  return StepRunnerOutputParamDef.fromPartial({
    key: `var:${keyName}`,
    name: (v.paramName ?? "").trim() || keyName,
    description: (v.desc ?? "").trim(),
    varType: v.varType ?? CsVarType.Text,
    isAdvanced: false,
    visibleExpression: (op?.visibleExpression ?? "").trim(),
    customTypeName: "",
    skipLogContent: false,
    validForList: [],
    invalidForList: []
  });
}

/**
 * Mirrors desktop ActionStepEditorWindow.BuildUI for sys:subprogram: prepend var:* defs from the
 * resolved subprogram's variables, then append remaining runner params (excluding subProgram/summary).
 */
export function augmentStepRunnerItemForSubProgramEdit(
  base: StepRunnerItem | undefined,
  subProgramVariables: readonly ActionVariable[] | undefined
): StepRunnerItem | undefined {
  if (!base) {
    return undefined;
  }
  const vars = subProgramVariables ?? [];
  const filteredBaseInputs = (base.inputParamDefs ?? []).filter(
    (d) => (d.key ?? "").length > 0 && !HIDDEN_SUBPROGRAM_RUNNER_INPUT_KEYS.has(d.key)
  );
  const baseOutputs = [...(base.outputParamDefs ?? [])];

  const dynInputs: StepRunnerInputParamDef[] = [];
  for (const v of vars) {
    if (!v.isInput) {
      continue;
    }
    const kn = actionVariableRowKey(v).trim();
    if (!kn) {
      continue;
    }
    dynInputs.push(actionVariableToSubProgramStepInputDef(v));
  }

  const dynOutputs: StepRunnerOutputParamDef[] = [];
  for (const v of vars) {
    if (!v.isOutput) {
      continue;
    }
    const kn = actionVariableRowKey(v).trim();
    if (!kn) {
      continue;
    }
    dynOutputs.push(actionVariableToSubProgramStepOutputDef(v));
  }

  return StepRunnerItem.fromPartial({
    ...base,
    inputParamDefs: [...dynInputs, ...filteredBaseInputs],
    outputParamDefs: [...baseOutputs, ...dynOutputs]
  });
}
