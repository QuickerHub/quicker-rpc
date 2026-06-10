import { formatActionIdShort } from "@/lib/action-patch-followup";
import { SIDE_PANEL_VIEW_TRACE } from "@/lib/workspace-side-panel-view";

export const ACTION_TRACE_TAB_PREFIX = "__trace__:";

export function buildActionTraceTabId(
  actionId: string,
  param?: string,
): string {
  const id = actionId.trim();
  const p = param?.trim() ?? "";
  return `${ACTION_TRACE_TAB_PREFIX}${id}::${encodeURIComponent(p)}`;
}

export function isActionTraceTabId(viewId: string): boolean {
  if (typeof viewId !== "string") return false;
  return viewId.startsWith(ACTION_TRACE_TAB_PREFIX);
}

export function isSidePanelTraceView(viewId: string): boolean {
  if (typeof viewId !== "string") return false;
  return viewId === SIDE_PANEL_VIEW_TRACE || isActionTraceTabId(viewId);
}

export function parseActionTraceTabId(
  tabId: string,
): { actionId: string; param?: string } | null {
  if (!isActionTraceTabId(tabId)) return null;
  const rest = tabId.slice(ACTION_TRACE_TAB_PREFIX.length);
  const splitAt = rest.indexOf("::");
  if (splitAt < 0) return { actionId: rest.trim() };
  const actionId = rest.slice(0, splitAt).trim();
  const paramRaw = rest.slice(splitAt + 2);
  if (!actionId) return null;
  let param: string | undefined;
  if (paramRaw.length > 0) {
    try {
      param = decodeURIComponent(paramRaw);
    } catch {
      param = paramRaw;
    }
  }
  return { actionId, param: param || undefined };
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
