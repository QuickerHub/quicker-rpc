export type ToolPopupViewMode = "visual" | "model";

const TOOL_POPUP_VIEW_MODE_KEY = "agent-gui-tool-popup-view-mode";

function readStoredToolPopupViewMode(): ToolPopupViewMode | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(TOOL_POPUP_VIEW_MODE_KEY);
  if (raw === "model" || raw === "source" || raw === "agent") return "model";
  if (raw === "visual") return "visual";
  return null;
}

/** Last-selected tool result popup tab (all ToolResultPopup instances). */
export function loadToolPopupViewMode(): ToolPopupViewMode {
  return readStoredToolPopupViewMode() ?? "visual";
}

export function storeToolPopupViewMode(mode: ToolPopupViewMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOOL_POPUP_VIEW_MODE_KEY, mode);
}

/** Apply stored preference; fall back to model when visual is unavailable. */
export function resolveToolPopupTab(hasVisual: boolean): ToolPopupViewMode {
  const preferred = readStoredToolPopupViewMode() ?? "visual";
  if (preferred === "model") return "model";
  return hasVisual ? "visual" : "model";
}

/** Map selected tab to the body view; visual is coerced when unavailable. */
export function resolveToolPopupBodyView(
  tab: ToolPopupViewMode,
  hasVisual: boolean,
): ToolPopupViewMode {
  if (tab === "model") return "model";
  if (tab === "visual" && !hasVisual) return "model";
  return tab;
}
