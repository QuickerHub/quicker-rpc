import type { StepRunnerInputParamDef, StepRunnerParamSelectionItem } from "@/lib/action-editor/types/action_query";
import type { ActionStepParam } from "@/lib/action-editor/types/common";
import { ParamVariableMode } from "./csStepEnums";

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.localeCompare(b, "en", { sensitivity: "accent" }) === 0;
}

/**
 * Mirrors WPF EnumParamEditor: when AllowInput is false and stored value is no longer
 * in SelectionItems, append a synthetic obsolete row.
 */
export function buildEnumSelectionOptions(
  items: readonly StepRunnerParamSelectionItem[],
  currentValue: string,
  allowInput: boolean,
): StepRunnerParamSelectionItem[] {
  const value = (currentValue ?? "").trim();
  if (!value) {
    return [...items];
  }
  const exists = items.some((x) => equalsIgnoreCase((x.value ?? "").trim(), value));
  if (exists || allowInput) {
    return [...items];
  }
  return [
    ...items,
    {
      value,
      name: `【已过时】${value}`,
      description: "",
    },
  ];
}

export function findEnumSelectionItem(
  items: readonly StepRunnerParamSelectionItem[],
  currentValue: string,
): StepRunnerParamSelectionItem | null {
  const value = (currentValue ?? "").trim();
  if (!value) {
    return null;
  }
  return items.find((x) => equalsIgnoreCase((x.value ?? "").trim(), value)) ?? null;
}

/** VarOrValue fields always support typed literals via the popup "输入内容" row. */
export function varOrValueParamAllowsFreeInput(
  def: Pick<StepRunnerInputParamDef, "allowInput" | "variableMode">,
): boolean {
  const vm = def.variableMode;
  return (
    def.allowInput
    || vm === ParamVariableMode.UseVarOrInput
    || vm === ParamVariableMode.UseVar
  );
}

export type VarOrValueDisplayMode = "input" | "enum" | "variable";

/** Infer display mode from wire param; never treat synthetic obsolete rows as enum. */
export function resolveVarOrValueDisplayMode(
  param: ActionStepParam,
  catalogSelectionItems: readonly StepRunnerParamSelectionItem[],
): VarOrValueDisplayMode {
  if ((param.varKey ?? "").trim().length > 0) {
    return "variable";
  }
  const value = (param.value ?? "").trim();
  if (value.length > 0 && findEnumSelectionItem(catalogSelectionItems, value) != null) {
    return "enum";
  }
  return "input";
}
