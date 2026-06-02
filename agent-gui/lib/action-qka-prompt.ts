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

/** Model-facing inline Quicker action reference: id + display name only. */
export function formatActionQkaForModel(action: PinnedAction): string {
  return `<qka id="${escapeQkaAttr(action.id)}">${escapeQkaText(action.title)}</qka>`;
}
