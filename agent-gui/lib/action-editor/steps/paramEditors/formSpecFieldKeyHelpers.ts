import type { ActionVariable } from "@/lib/action-editor/types/common";
import { actionVariableRowKey } from "../../variables/actionVariableUi";
import { CsVarType } from "./csStepEnums";
import { isStepParamVarAssignable } from "./stepParamVarAssign";
import type { FormFieldType, FormSpecField } from "./formSpecModel";

/** Map form field editor type to Quicker variable type for key assignment. */
export function formFieldTypeToVarType(fieldType: FormFieldType): number {
  switch (fieldType) {
    case "number":
      return CsVarType.Number;
    case "integer":
      return CsVarType.Integer;
    case "boolean":
      return CsVarType.Boolean;
    case "dateTime":
      return CsVarType.DateTime;
    default:
      return CsVarType.Text;
  }
}

export function buildFormFieldKeyCandidates(
  variables: ActionVariable[],
  fieldType: FormFieldType,
  usedKeys: ReadonlySet<string>,
): ActionVariable[] {
  const targetVarType = formFieldTypeToVarType(fieldType);
  return variables
    .filter((variable) => {
      const key = actionVariableRowKey(variable).trim();
      if (!key) {
        return false;
      }
      if (usedKeys.has(key.toLowerCase())) {
        return false;
      }
      return isStepParamVarAssignable(variable.varType ?? CsVarType.Any, targetVarType);
    })
    .sort((a, b) => actionVariableRowKey(a).localeCompare(actionVariableRowKey(b), "zh-CN"));
}

export function collectUsedFormFieldKeys(fields: FormSpecField[], exceptIndex: number): Set<string> {
  const used = new Set<string>();
  fields.forEach((item, index) => {
    if (index === exceptIndex) {
      return;
    }
    const key = (item.key ?? "").trim().toLowerCase();
    if (key) {
      used.add(key);
    }
  });
  return used;
}

/** Apply key change; keep target/label in sync when they still mirror the old key. */
export function patchFormFieldKeyChange(
  field: FormSpecField,
  nextKey: string,
  variables: ActionVariable[],
): Partial<FormSpecField> {
  const trimmed = nextKey.trim();
  const prevKey = (field.key ?? "").trim();
  const patch: Partial<FormSpecField> = { key: nextKey };

  const target = (field.target ?? "").trim();
  if (!target || target === prevKey) {
    patch.target = trimmed || nextKey;
  }

  const label = (field.label ?? "").trim();
  if (!label || label === prevKey) {
    const variable = variables.find((item) => actionVariableRowKey(item) === trimmed);
    const desc = (variable?.desc ?? "").trim();
    patch.label = desc || trimmed || field.label;
  }

  return patch;
}
