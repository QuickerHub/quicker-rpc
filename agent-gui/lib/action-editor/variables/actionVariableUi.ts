import type { ActionVariable } from "@/lib/action-editor/types/common";
import { CsVarType } from "../steps/paramEditors/csStepEnums";

/**
 * VarType int → C# enum name for `res:Var/{Name}.png` (Quicker.Domain.Actions.X.Storage.ActionVariable.IconStr).
 */
const VAR_TYPE_ICON_BASE_NAMES: Record<number, string> = {
  [CsVarType.Text]: "Text",
  [CsVarType.Number]: "Number",
  [CsVarType.Boolean]: "Boolean",
  [CsVarType.Image]: "Image",
  [CsVarType.List]: "List",
  [CsVarType.DateTime]: "DateTime",
  [CsVarType.Keyboard]: "Keyboard",
  [CsVarType.Mouse]: "Mouse",
  [CsVarType.Enum]: "Enum",
  [CsVarType.Dict]: "Dict",
  [CsVarType.Form]: "Form",
  [CsVarType.Integer]: "Integer",
  [CsVarType.Table]: "Table",
  [CsVarType.FormForDict]: "FormForDict",
  [CsVarType.Object]: "Object",
  [CsVarType.Any]: "Any"
};

/** VarType int → short label (Quicker.Public.Actions.VarType). */
export const ACTION_VAR_TYPE_LABELS: Record<number, string> = {
  [CsVarType.Text]: "Text",
  [CsVarType.Number]: "Number",
  [CsVarType.Boolean]: "Boolean",
  [CsVarType.Image]: "Image",
  [CsVarType.List]: "List",
  [CsVarType.DateTime]: "DateTime",
  [CsVarType.Keyboard]: "Keyboard",
  [CsVarType.Mouse]: "Mouse",
  [CsVarType.Enum]: "Enum",
  [CsVarType.Dict]: "Dict",
  [CsVarType.Form]: "Form",
  [CsVarType.Integer]: "Integer",
  [CsVarType.Table]: "Table",
  [CsVarType.FormForDict]: "Form (Dict)",
  [CsVarType.Object]: "Object",
  [CsVarType.Any]: "Any",
  [CsVarType.NA]: "NA",
  [CsVarType.CreateVar]: "CreateVar"
};

/** VarType int → Chinese label (align with desktop VariableEditorWindow). */
export const ACTION_VAR_TYPE_ZH_LABELS: Record<number, string> = {
  [CsVarType.Text]: "文本",
  [CsVarType.Image]: "图片",
  [CsVarType.Boolean]: "布尔",
  [CsVarType.Number]: "数字(小数)",
  [CsVarType.Integer]: "数字(整数)",
  [CsVarType.DateTime]: "时间日期",
  [CsVarType.List]: "文本列表",
  [CsVarType.Dict]: "词典",
  [CsVarType.Table]: "表格",
  [CsVarType.Any]: "动态对象"
};

const ACTION_VAR_TYPE_SELECT_OPTION_SEED: Array<{ value: number; label: string; order: number }> = [
  { value: CsVarType.Text, label: "Text", order: 10 },
  { value: CsVarType.Image, label: "Image", order: 12 },
  { value: CsVarType.Boolean, label: "Boolean", order: 1 },
  { value: CsVarType.Number, label: "Number (decimal)", order: 2 },
  { value: CsVarType.Integer, label: "Integer", order: 3 },
  { value: CsVarType.DateTime, label: "DateTime", order: 11 },
  { value: CsVarType.List, label: "List", order: 21 },
  { value: CsVarType.Dict, label: "Dict", order: 22 },
  { value: CsVarType.Table, label: "Table", order: 34 },
  { value: CsVarType.Any, label: "Any (dynamic object)", order: 32 }
];

/**
 * Keep the same order as C# VarType Display(Order).
 */
export const ACTION_VAR_TYPE_SELECT_OPTIONS: Array<{ value: number; label: string }> =
  ACTION_VAR_TYPE_SELECT_OPTION_SEED
    .slice()
    .sort((a, b) => (a.order - b.order) || (a.value - b.value))
    .map(({ value, label }) => ({ value, label }));

export function actionVarTypeLabel(varType: number): string {
  return ACTION_VAR_TYPE_LABELS[varType] ?? `Type(${varType})`;
}

export function actionVarTypeZhLabel(varType: number): string {
  return ACTION_VAR_TYPE_ZH_LABELS[varType] ?? actionVarTypeLabel(varType);
}

/**
 * Same rules as Quicker.Domain.Actions.X.Storage.ActionVariable.IconStr (WPF IconControl2).
 */
export function actionVariableIconStr(varType: number): string {
  if (varType === CsVarType.NA) {
    return "";
  }
  if (varType === CsVarType.CreateVar) {
    return "fa:Light_Plus:#39b54d";
  }
  const base = VAR_TYPE_ICON_BASE_NAMES[varType];
  return base ? `res:Var/${base}.png` : `res:Var/Any.png`;
}

/** Variable name for display/filter; tolerates JSON `Key` from some serializers. */
export function actionVariableRowKey(v: ActionVariable): string {
  const raw = (v as unknown as { Key?: string }).Key ?? v.key;
  return typeof raw === "string" ? raw : "";
}

export function matchesVariableListFilter(
  v: { key: string; group: string; desc: string },
  filterPaneVisible: boolean,
  searchText: string
): boolean {
  if (!filterPaneVisible) {
    return true;
  }
  const q = searchText.trim();
  if (!q) {
    return true;
  }
  if (v.group === q) {
    return true;
  }
  const qq = q.toLowerCase();
  return (
    (v.key ?? "").toLowerCase().includes(qq) ||
    (v.desc ?? "").toLowerCase().includes(qq) ||
    (v.group ?? "").toLowerCase().includes(qq)
  );
}
