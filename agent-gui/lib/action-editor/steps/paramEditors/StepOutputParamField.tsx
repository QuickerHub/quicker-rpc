import { useMemo } from "react";
import type { ActionVariable } from "@/lib/action-editor/types/common";
import type { StepRunnerOutputParamDef } from "@/lib/action-editor/types/action_query";
import { actionVariableRowKey } from "../../variables/actionVariableUi";
import { CsVarType } from "./csStepEnums";
import { StepVariablePicker } from "./StepVariablePicker";

export type StepOutputParamFieldProps = {
  def: StepRunnerOutputParamDef;
  variables: ActionVariable[];
  /** Target variable name / key to receive this output (ActionStep.output_params value). */
  value: string;
  onChange: (next: string) => void;
};

function isVarAssignable(fromType: number, toType: number): boolean {
  if (fromType === CsVarType.Any || toType === CsVarType.Any) {
    return true;
  }
  if (
    (fromType === CsVarType.Integer && toType === CsVarType.Number) ||
    (fromType === CsVarType.Number && toType === CsVarType.Integer)
  ) {
    return true;
  }
  if (toType === CsVarType.Text) {
    return fromType !== CsVarType.Image;
  }
  if (toType === CsVarType.Enum) {
    return fromType === CsVarType.Text;
  }
  if (toType === CsVarType.List) {
    return fromType === CsVarType.Text || fromType === CsVarType.Any || fromType === CsVarType.List;
  }
  if (toType === CsVarType.Object) {
    return (
      fromType === CsVarType.Object ||
      fromType === CsVarType.Any ||
      fromType === CsVarType.Table ||
      fromType === CsVarType.Image
    );
  }
  return fromType === toType;
}

function splitOutputVarTarget(raw: string): { varKey: string; dictKey: string } {
  const text = raw.trim();
  if (!text) {
    return { varKey: "", dictKey: "" };
  }
  const dotIndex = text.indexOf(".");
  if (dotIndex <= 0) {
    return { varKey: text, dictKey: "" };
  }
  return { varKey: text.slice(0, dotIndex), dictKey: text.slice(dotIndex + 1) };
}

function mergeOutputVarTarget(varKey: string, dictKey: string): string {
  const selected = varKey.trim();
  if (!selected) {
    return "";
  }
  const k = dictKey.trim();
  return k ? `${selected}.${k}` : selected;
}

export function StepOutputParamField({ def, variables, value, onChange }: StepOutputParamFieldProps): JSX.Element {
  const label = (def.name ?? "").trim() || def.key;
  const desc = (def.description ?? "").trim();
  const parsedValue = useMemo(() => splitOutputVarTarget(value), [value]);
  const filteredVariables = useMemo(
    () =>
      variables
        .filter((v) => {
          const key = actionVariableRowKey(v).trim();
          return key.length > 0 && isVarAssignable(v.varType ?? CsVarType.Any, def.varType);
        })
        .sort((a, b) => actionVariableRowKey(a).localeCompare(actionVariableRowKey(b), "zh-CN")),
    [variables, def.varType]
  );
  const selectedVariable =
    filteredVariables.find((v) => actionVariableRowKey(v) === parsedValue.varKey) ??
    variables.find((v) => actionVariableRowKey(v) === parsedValue.varKey);
  const selectedKey = selectedVariable ? actionVariableRowKey(selectedVariable) : parsedValue.varKey;
  const showDictKeyInput = (selectedVariable?.varType ?? -1) === CsVarType.Dict;
  return (
    <div className="step-param-row">
      <div className="step-param-label">{label}</div>
      <div className="step-param-field-col">
        <div className={`step-param-output-target ${showDictKeyInput ? "step-param-output-target--dict" : ""}`}>
          <div className="step-param-output-picker-row">
            <StepVariablePicker
              candidates={filteredVariables}
              resolveVariables={variables}
              selectedVarKey={parsedValue.varKey}
              onChange={(nextVarKey) => onChange(mergeOutputVarTarget(nextVarKey, showDictKeyInput ? parsedValue.dictKey : ""))}
              title={desc || undefined}
            />
            {desc ? (
              <div className="step-param-hint step-param-hint--output-inline" title={desc}>
                {desc}
              </div>
            ) : null}
          </div>
          {showDictKeyInput ? (
            <input
              className="step-param-control step-param-control--dict-key"
              type="text"
              value={parsedValue.dictKey}
              placeholder="key"
              onChange={(event) => onChange(mergeOutputVarTarget(selectedKey, event.target.value))}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
