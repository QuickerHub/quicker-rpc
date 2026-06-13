import type { PinnedAction } from "@/lib/action-context";

function escapeQkaAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escapeQkaText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Model-facing inline Quicker action/subprogram/designer-step reference. */
export function formatActionQkaForModel(action: PinnedAction): string {
  if (action.kind === "designer-step") {
    const attrs = ['kind="designer-step"'];
    const actionId = (action.entityId ?? action.id).trim();
    if (actionId) {
      attrs.push(`action-id="${escapeQkaAttr(actionId)}"`);
    }
    if (typeof action.stepIndex === "number" && Number.isFinite(action.stepIndex)) {
      attrs.push(`step-index="${action.stepIndex}"`);
    }
    const stepId = action.stepId?.trim();
    if (stepId) {
      attrs.push(`step-id="${escapeQkaAttr(stepId)}"`);
    }
    const runner = action.stepRunnerKey?.trim();
    if (runner) {
      attrs.push(`step-runner="${escapeQkaAttr(runner)}"`);
    }
    if (action.isSubProgram) {
      attrs.push('target="subprogram"');
    }
    return `<qka ${attrs.join(" ")}>${escapeQkaText(action.title)}</qka>`;
  }
  if (action.kind === "subprogram") {
    const attrs = [`id="${escapeQkaAttr(action.id)}"`];
    const call = action.callIdentifier?.trim();
    if (call) {
      attrs.push(`call="${escapeQkaAttr(call)}"`);
    }
    return `<qka kind="subprogram" ${attrs.join(" ")}>${escapeQkaText(action.title)}</qka>`;
  }
  return `<qka id="${escapeQkaAttr(action.id)}">${escapeQkaText(action.title)}</qka>`;
}
