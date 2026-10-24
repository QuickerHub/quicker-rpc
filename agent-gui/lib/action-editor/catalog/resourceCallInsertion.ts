import type { DesignerResourceItem, DesignerResourceKind } from "./designerResourcePage";
import type { ResourceCallOrigin, ToolboxDragPayload } from "../steps/toolboxStepFactory";
import type { StepRunnerItem } from "../types/action_query";

// Quicker 574556d76b ResourceExplorer:318-342 and toolboxStepFactory; native
// SubProgramStepV2.Definition declares sys:subprogram / subProgram, without a control field.
export function buildResourceCallPayload(kind: DesignerResourceKind, item: DesignerResourceItem, origin: ResourceCallOrigin): ToolboxDragPayload | null {
  if (kind !== "global_subprogram" || !item.id.trim() || !item.callIdentifier?.trim()
    || !origin.documentKey || !origin.catalogKey || !origin.ownerId) return null;
  return { stepRunnerKey: "sys:subprogram", name: item.title || item.id,
    inputPresets: { subProgram: item.callIdentifier },
    resourceCall: { ...origin, resourceId: item.id, callIdentifier: item.callIdentifier } };
}

export function resourceCallMatchesOrigin(payload: ToolboxDragPayload, origin: ResourceCallOrigin | undefined): boolean {
  const call = payload.resourceCall;
  return Boolean(call && origin && call.documentKey === origin.documentKey && call.catalogKey === origin.catalogKey && call.ownerId === origin.ownerId
    && typeof call.resourceId === "string" && call.resourceId.trim() && typeof call.callIdentifier === "string" && call.callIdentifier.trim()
    && payload.stepRunnerKey === "sys:subprogram" && payload.subProgramIdentifier === undefined && payload.controlFieldValue === undefined
    && payload.inputPresets && Object.keys(payload.inputPresets).length === 1 && payload.inputPresets.subProgram === call.callIdentifier);
}

export function requireResourceCallSchema(payload: ToolboxDragPayload, detail: StepRunnerItem | null): void {
  if (!payload.resourceCall) return;
  if (!resourceCallMatchesOrigin(payload, payload.resourceCall) || detail?.key !== "sys:subprogram"
    || !detail.inputParamDefs.some((def) => def.key === "subProgram" && !def.isControlField)
    || detail.inputParamDefs.some((def) => def.isControlField))
    throw new Error("无法核验绑定宿主的子程序调用参数，未插入步骤。请重新读取资源。");
}
