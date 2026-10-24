import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import type { ActionStep } from "@/lib/action-editor/types/common";
import { inferControlFieldKeyFromStep } from "@/lib/action-editor/steps/stepControlFieldInfer";
import { ensureParamValue } from "./stepParamValue";

export { inferControlFieldKeyFromStep };

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

/** Full UI comparison for rendering, not proof of current provider content. */
export function runnerSchemaFingerprint(item: StepRunnerItem | undefined): string {
  return item ? JSON.stringify(item) : "";
}

/** Params-only fingerprint to skip no-op draft merges. */
export function draftParamsFingerprint(step: ActionStep): string {
  return JSON.stringify({
    inputParams: step.inputParams,
    outputParams: step.outputParams,
  });
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
