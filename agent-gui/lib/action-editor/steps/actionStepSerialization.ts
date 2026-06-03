import type { StepRunnerItem } from "@/lib/action-editor/types/action_query";
import type { ActionStep, ActionStepParam, ActionSubProgram } from "@/lib/action-editor/types/common";
import { resolveRunnerItemForStepKey } from "./stepRunnerCatalog";

function normalizeParam(param: ActionStepParam | undefined): { varKey: string; value: string; file?: string } {
  const file = param?.file?.trim();
  return {
    varKey: param?.varKey ?? "",
    value: param?.value ?? "",
    ...(file ? { file } : {}),
  };
}

function getDefaultInputValue(runnerItem: StepRunnerItem | undefined, key: string): string {
  return runnerItem?.inputParamDefs?.find((def) => def.key === key)?.defaultValue ?? "";
}

function compactInputParams(
  params: { [key: string]: ActionStepParam } | undefined,
  runnerItem: StepRunnerItem | undefined
): { [key: string]: ActionStepParam } {
  const out: { [key: string]: ActionStepParam } = {};
  for (const [key, raw] of Object.entries(params ?? {})) {
    const param = normalizeParam(raw);
    if (
      param.varKey !== "" ||
      param.value !== getDefaultInputValue(runnerItem, key) ||
      param.file
    ) {
      out[key] = param;
    }
  }
  return out;
}

function compactOutputParams(params: { [key: string]: string } | undefined): { [key: string]: string } {
  const out: { [key: string]: string } = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    const normalized = value ?? "";
    if (normalized !== "") {
      out[key] = normalized;
    }
  }
  return out;
}

export function compactActionStepParams(
  step: ActionStep,
  runnerItem: StepRunnerItem | undefined
): ActionStep {
  return {
    ...step,
    inputParams: compactInputParams(step.inputParams, runnerItem),
    outputParams: compactOutputParams(step.outputParams)
  };
}

export function compactActionStepTree(
  step: ActionStep,
  runnerItems: readonly StepRunnerItem[]
): ActionStep {
  const runnerItem = resolveRunnerItemForStepKey(runnerItems, step.stepRunnerKey);
  const compacted = compactActionStepParams(step, runnerItem);
  return {
    ...compacted,
    ifSteps: (step.ifSteps ?? []).map((child) => compactActionStepTree(child, runnerItems)),
    elseSteps: (step.elseSteps ?? []).map((child) => compactActionStepTree(child, runnerItems))
  };
}

export function compactActionSteps(
  steps: readonly ActionStep[],
  runnerItems: readonly StepRunnerItem[]
): ActionStep[] {
  return steps.map((step) => compactActionStepTree(step, runnerItems));
}

export function compactActionSubPrograms(
  subPrograms: readonly ActionSubProgram[],
  runnerItems: readonly StepRunnerItem[]
): ActionSubProgram[] {
  return subPrograms.map((subProgram) => ({
    ...subProgram,
    steps: compactActionSteps(subProgram.steps ?? [], runnerItems),
    subPrograms: compactActionSubPrograms(subProgram.subPrograms ?? [], runnerItems)
  }));
}

export function areStepParamsEqualAfterCompaction(
  original: ActionStep,
  draft: ActionStep,
  runnerItem: StepRunnerItem | undefined
): boolean {
  const a = compactActionStepParams(original, runnerItem);
  const b = compactActionStepParams(draft, runnerItem);
  const inputKeys = new Set<string>([...Object.keys(a.inputParams ?? {}), ...Object.keys(b.inputParams ?? {})]);
  for (const key of inputKeys) {
    const av = normalizeParam(a.inputParams[key]);
    const bv = normalizeParam(b.inputParams[key]);
    if (av.varKey !== bv.varKey || av.value !== bv.value || (av.file ?? "") !== (bv.file ?? "")) {
      return false;
    }
  }

  const outputKeys = new Set<string>([...Object.keys(a.outputParams ?? {}), ...Object.keys(b.outputParams ?? {})]);
  for (const key of outputKeys) {
    if ((a.outputParams[key] ?? "") !== (b.outputParams[key] ?? "")) {
      return false;
    }
  }
  return true;
}
