export type ToolPopupViewMode = "visual" | "source";

const TOOL_POPUP_VIEW_MODE_KEY = "agent-gui-tool-popup-view-mode";

/** Last-selected tool result popup tab (all ToolResultPopup instances). */
export function loadToolPopupViewMode(): ToolPopupViewMode {
  if (typeof window === "undefined") return "visual";
  return localStorage.getItem(TOOL_POPUP_VIEW_MODE_KEY) === "source"
    ? "source"
    : "visual";
}

export function storeToolPopupViewMode(mode: ToolPopupViewMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOOL_POPUP_VIEW_MODE_KEY, mode);
}

/** Apply stored preference; fall back to source when visual is unavailable. */
export function resolveToolPopupTab(hasVisual: boolean): ToolPopupViewMode {
  const preferred = loadToolPopupViewMode();
  if (preferred === "source") return "source";
  return hasVisual ? "visual" : "source";
}

/** Map selected tab to the body view; visual is coerced when unavailable. */
export function resolveToolPopupBodyView(
  tab: ToolPopupViewMode,
  hasVisual: boolean,
): ToolPopupViewMode {
  return tab === "visual" && !hasVisual ? "source" : tab;
}
