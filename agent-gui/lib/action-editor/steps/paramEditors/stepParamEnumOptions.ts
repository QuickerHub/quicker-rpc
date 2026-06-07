import type { StepRunnerParamSelectionItem } from "@/lib/action-editor/types/action_query";

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
