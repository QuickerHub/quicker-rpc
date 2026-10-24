import { formatActionIdShort } from "@/lib/action-patch-followup";
import { SIDE_PANEL_VIEW_TRACE } from "@/lib/workspace-side-panel-view";

export const ACTION_TRACE_TAB_PREFIX = "__trace__:";

export function isActionTraceTabId(viewId: string): boolean {
  if (typeof viewId !== "string") return false;
  return viewId.startsWith(ACTION_TRACE_TAB_PREFIX);
}

export function isSidePanelTraceView(viewId: string): boolean {
  if (typeof viewId !== "string") return false;
  return viewId === SIDE_PANEL_VIEW_TRACE || isActionTraceTabId(viewId);
}

export function formatActionTraceTabLabel(options: {
  actionId: string;
  actionTitle?: string;
  status?: string;
}): string {
  const title =
    options.actionTitle?.trim()
    || formatActionIdShort(options.actionId);
  if (options.status === "running") {
    return `${title} · 调试中`;
  }
  return title;
}
