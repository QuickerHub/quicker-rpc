import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import type { ActionStep } from "@/lib/action-editor/types/common";

/** Prefer runner control field, then step keys that carry a literal value. */
export function inferControlFieldKeyFromStep(
  step: ActionStep | null | undefined,
  runnerItem: StepRunnerItem | undefined,
): string {
  const fromRunner = runnerItem?.inputParamDefs?.find((d) => d.isControlField)?.key?.trim();
  if (fromRunner && step?.inputParams?.[fromRunner] != null) {
    return fromRunner;
  }

  for (const key of ["type", "operation"] as const) {
    const pin = step?.inputParams?.[key];
    if (pin == null) continue;
    if ((pin.varKey ?? "").trim().length > 0) continue;
    if ((pin.value ?? "").trim().length > 0) return key;
  }

  if (step?.inputParams?.type != null) return "type";
  if (step?.inputParams?.operation != null) return "operation";
  return fromRunner ?? "";
}
