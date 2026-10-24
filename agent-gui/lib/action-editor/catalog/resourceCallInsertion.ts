import type { DesignerResourceItem, DesignerResourceKind } from "./designerResourcePage";
import type { ResourceCallOrigin, ToolboxDragPayload } from "../steps/toolboxStepFactory";
import type { StepRunnerItem } from "../types/action_query";

// Quicker 574556d76b ResourceExplorer:318-342 and toolboxStepFactory; native
// SubProgramStepV2.Definition declares sys:subprogram / subProgram, without a control field.
// Action drops: Quicker 574556d76b StepListDropHandler:245-262 and RunActionStepV2.Definition.
// It accepts any catalog ActionItem, independent of the body/open capability or ActionType.
const actionGuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function buildResourceCallPayload(kind: DesignerResourceKind, item: DesignerResourceItem, origin: ResourceCallOrigin): ToolboxDragPayload | null {
  if (!item.id.trim() || !origin.documentKey || !origin.catalogKey || !origin.ownerId) return null;
  if (kind === "action") return actionGuid.test(item.id) ? {
    stepRunnerKey: "sys:runAction", name: item.title || item.id, stepNote: item.title,
    controlFieldValue: "StartAction", inputPresets: { actionId: item.id },
    resourceCall: { ...origin, kind, resourceId: item.id, callIdentifier: item.id },
  } : null;
  if (!item.callIdentifier?.trim()) return null;
  return { stepRunnerKey: "sys:subprogram", name: item.title || item.id,
    inputPresets: { subProgram: item.callIdentifier },
    resourceCall: { ...origin, resourceId: item.id, callIdentifier: item.callIdentifier } };
}

export function resourceCallMatchesOrigin(payload: ToolboxDragPayload, origin: ResourceCallOrigin | undefined): boolean {
  const call = payload.resourceCall;
  if (!call || !origin || call.documentKey !== origin.documentKey || call.catalogKey !== origin.catalogKey || call.ownerId !== origin.ownerId
    || typeof call.resourceId !== "string" || !call.resourceId.trim() || typeof call.callIdentifier !== "string" || !call.callIdentifier.trim()
    || payload.subProgramIdentifier !== undefined || !payload.inputPresets || Object.keys(payload.inputPresets).length !== 1) return false;
  if (call.kind === "action") return actionGuid.test(call.resourceId) && call.callIdentifier === call.resourceId
    && payload.stepRunnerKey === "sys:runAction" && payload.controlFieldValue === "StartAction"
    && payload.inputPresets.actionId === call.resourceId && typeof payload.stepNote === "string";
  return (call.kind === undefined || call.kind === "global_subprogram") && payload.stepRunnerKey === "sys:subprogram"
    && payload.controlFieldValue === undefined && payload.inputPresets.subProgram === call.callIdentifier;
}

export function requireResourceCallSchema(payload: ToolboxDragPayload, detail: StepRunnerItem | null): void {
  if (!payload.resourceCall) return;
  if (payload.resourceCall.kind === "action") {
    const control = detail?.inputParamDefs.filter((def) => def.isControlField);
    if (!resourceCallMatchesOrigin(payload, payload.resourceCall) || detail?.key !== "sys:runAction"
      || control?.length !== 1 || control[0].key !== "type" || !control[0].selectionItems.some((item) => item.value === "StartAction")
      || !detail.inputParamDefs.some((def) => def.key === "actionId" && !def.isControlField && def.varType === 0))
      throw new Error("无法核验绑定宿主的动作调用参数，未插入步骤。请重新读取资源。");
    return;
  }
  if (!resourceCallMatchesOrigin(payload, payload.resourceCall) || detail?.key !== "sys:subprogram"
    || !detail.inputParamDefs.some((def) => def.key === "subProgram" && !def.isControlField)
    || detail.inputParamDefs.some((def) => def.isControlField))
    throw new Error("无法核验绑定宿主的子程序调用参数，未插入步骤。请重新读取资源。");
}
