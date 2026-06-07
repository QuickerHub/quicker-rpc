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

/** Model-facing inline Quicker action/subprogram reference. */
export function formatActionQkaForModel(action: PinnedAction): string {
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
