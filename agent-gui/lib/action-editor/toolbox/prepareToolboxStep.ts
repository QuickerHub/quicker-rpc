import type { StepRunnerItem } from "../types/action_query";
import { buildStepFromRunner, type ToolboxDragPayload } from "../steps/toolboxStepFactory";
import { requireResourceCallSchema } from "../catalog/resourceCallInsertion";

/** A list row intentionally has no parameter definitions. Resolve the selected schema before seeding it. */
export async function prepareToolboxStep(
  payload: ToolboxDragPayload,
  runnerItems: StepRunnerItem[],
  createStepId: () => string,
  loadDetail: (key: string, control?: string) => Promise<StepRunnerItem | null>,
) {
  const detail = await loadDetail(payload.stepRunnerKey, payload.controlFieldValue);
  requireResourceCallSchema(payload, detail);
  const items = detail ? [{ ...detail, key: payload.stepRunnerKey }, ...runnerItems.filter((item) => item.key !== payload.stepRunnerKey)] : runnerItems;
  if (payload.controlFieldValue?.trim() && !items.find((item) => item.key === payload.stepRunnerKey)?.inputParamDefs.some((def) => def.isControlField)) {
    throw new Error("无法读取模块控制参数，未插入步骤。请重试。");
  }
  return buildStepFromRunner(payload, items, createStepId);
}
