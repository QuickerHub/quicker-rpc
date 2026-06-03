import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import type { ActionStep } from "@/lib/action-editor/types/common";
import { ensureParamValue } from "./StepInputParamField";

/** Stable fingerprint for external step changes (undo/redo, parent resync). */
export function stepEditorDraftFingerprint(step: ActionStep): string {
  return JSON.stringify({
    stepId: step.stepId,
    stepRunnerKey: step.stepRunnerKey,
    inputParams: step.inputParams,
    outputParams: step.outputParams,
    note: step.note,
    delayMs: step.delayMs,
    disabled: step.disabled,
  });
}

/** Detect runner schema shape changes without object identity churn. */
export function runnerSchemaFingerprint(item: StepRunnerItem | undefined): string {
  if (!item) return "";
  return JSON.stringify({
    key: item.key,
    input: (item.inputParamDefs ?? []).map((d) => ({
      k: d.key,
      vt: d.varType,
      vm: d.variableMode,
      control: d.isControlField,
      advanced: d.isAdvanced,
      items: (d.selectionItems ?? []).map((x) => x.value),
    })),
    output: (item.outputParamDefs ?? []).map((d) => ({
      k: d.key,
      advanced: d.isAdvanced,
    })),
  });
}

/** Params-only fingerprint to skip no-op draft merges. */
export function draftParamsFingerprint(step: ActionStep): string {
  return JSON.stringify({
    inputParams: step.inputParams,
    outputParams: step.outputParams,
  });
}

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

export function buildStepEditorDraft(
  step: ActionStep,
  editorRunnerItem: StepRunnerItem | undefined,
): ActionStep {
  const d = structuredClone(step);
  if (!d.outputParams) {
    d.outputParams = {};
  }
  if (editorRunnerItem?.inputParamDefs?.length) {
    for (const def of editorRunnerItem.inputParamDefs) {
      const k = def.key;
      if (!k) continue;
      d.inputParams[k] = ensureParamValue(def, d.inputParams[k]);
    }
  }
  if (editorRunnerItem?.outputParamDefs?.length) {
    for (const def of editorRunnerItem.outputParamDefs) {
      const k = def.key;
      if (!k) continue;
      if (d.outputParams[k] === undefined) {
        d.outputParams[k] = "";
      }
    }
  }
  return d;
}

/** Merge newly fetched runner defs into an in-progress draft (preserve user edits). */
export function mergeRunnerSchemaIntoStepDraft(
  draft: ActionStep,
  editorRunnerItem: StepRunnerItem | undefined,
): ActionStep {
  const d = structuredClone(draft);
  if (!d.outputParams) {
    d.outputParams = {};
  }
  if (editorRunnerItem?.inputParamDefs?.length) {
    for (const def of editorRunnerItem.inputParamDefs) {
      const k = def.key;
      if (!k) continue;
      d.inputParams[k] = ensureParamValue(def, d.inputParams[k]);
    }
  }
  if (editorRunnerItem?.outputParamDefs?.length) {
    for (const def of editorRunnerItem.outputParamDefs) {
      const k = def.key;
      if (!k) continue;
      if (d.outputParams[k] === undefined) {
        d.outputParams[k] = "";
      }
    }
  }
  return d;
}
