import type { ActionStep, ActionStepParam } from "@/lib/action-editor/types/common";
import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";

/** A resource gesture belongs to one visible document surface and complete catalog target. */
export type ResourceCallOrigin = Readonly<{ documentKey: string; catalogKey: string; ownerId: string }>;
export type ToolboxDragPayload = {
  stepRunnerKey: string;
  name?: string;
  icon?: string;
  controlFieldValue?: string;
  inputPresets?: Record<string, string>;
  /** When stepRunnerKey is sys:subprogram, pre-filled subProgram input (same as quick-insert). */
  subProgramIdentifier?: string;
  resourceCall?: ResourceCallOrigin & Readonly<{ resourceId: string; callIdentifier: string }>;
};

function resolveControlFieldParamKey(runnerItem: StepRunnerItem | undefined): string | undefined {
  const defs = runnerItem?.inputParamDefs ?? [];
  const d = defs.find((x) => x.isControlField);
  const k = d?.key?.trim();
  return k || undefined;
}

/** Builds a new ActionStep from toolbox drag / quick-insert payload (same as WPF CreateStep). */
export function buildStepFromRunner(
  payload: ToolboxDragPayload,
  runnerItems: StepRunnerItem[],
  createStepId: () => string
): ActionStep {
  const inputParams: { [key: string]: ActionStepParam } = {};
  const parentItem = runnerItems.find((it) => (it.key ?? "").trim() === payload.stepRunnerKey.trim());
  // Only materialize defaults explicitly supplied by a newer UI schema, never inferred runtime defaults.
  for (const def of parentItem?.inputParamDefs ?? []) {
    const creationDefault = (def as typeof def & { newStepDefaultValue?: string }).newStepDefaultValue;
    if (def.key.trim() && typeof creationDefault === "string") {
      inputParams[def.key] = { varKey: "", value: creationDefault };
    }
  }
  const preset = payload.controlFieldValue?.trim();
  if (preset) {
    const paramKey = resolveControlFieldParamKey(parentItem);
    if (paramKey) {
      inputParams[paramKey] = { varKey: "", value: preset };
    }
  }
  for (const [key, value] of Object.entries(payload.inputPresets ?? {})) {
    // Whitespace and empty literals are meaningful values; payload keys are the UI schema keys.
    if (key.trim() && typeof value === "string") inputParams[key] = { varKey: "", value };
  }
  const spIdent = payload.subProgramIdentifier?.trim();
  if (payload.stepRunnerKey.trim() === "sys:subprogram" && spIdent) {
    inputParams.subProgram = { varKey: "", value: spIdent };
  }
  return {
    stepRunnerKey: payload.stepRunnerKey,
    inputParams,
    outputParams: {},
    ifSteps: [],
    elseSteps: [],
    note: "",
    disabled: false,
    collapsed: false,
    delayMs: payload.stepRunnerKey === "delay" ? 500 : 0,
    stepId: createStepId()
  };
}
