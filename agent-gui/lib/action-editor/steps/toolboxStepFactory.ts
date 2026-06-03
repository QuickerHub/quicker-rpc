import type { ActionStep, ActionStepParam } from "@/lib/action-editor/types/common";
import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";

export type ToolboxDragPayload = {
  stepRunnerKey: string;
  name?: string;
  icon?: string;
  controlFieldValue?: string;
  /** When stepRunnerKey is sys:subprogram, pre-filled subProgram input (same as quick-insert). */
  subProgramIdentifier?: string;
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
  const preset = payload.controlFieldValue?.trim();
  if (preset) {
    const parentItem = runnerItems.find((it) => (it.key ?? "").trim() === payload.stepRunnerKey.trim());
    const paramKey = resolveControlFieldParamKey(parentItem);
    if (paramKey) {
      inputParams[paramKey] = { varKey: "", value: preset };
    }
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
