/** Pinned explorer tree tab in the right workspace side panel. */
export const SIDE_PANEL_VIEW_EXPLORER = "__side_explorer__";

/** Embedded agent browser tab in the right workspace side panel. */
export const SIDE_PANEL_VIEW_BROWSER = "__side_browser__";

/** Prefix for user-created embedded browser tabs (`__side_browser__:<id>`). */
export const SIDE_PANEL_BROWSER_TAB_PREFIX = "__side_browser__:";

/** Action trace stream in the right workspace side panel. */
export const SIDE_PANEL_VIEW_TRACE = "__side_trace__";

/** Default embedded terminal tab in the right workspace side panel. */
export const SIDE_PANEL_VIEW_TERMINAL = "__side_terminal__";

/** Prefix for user-created terminal tabs (`__side_terminal__:<id>`). */
export const SIDE_PANEL_TERMINAL_TAB_PREFIX = "__side_terminal__:";

export const DEFAULT_EMBEDDED_TERMINAL_ID = "default";

/** Matches workspace file preview tab id in workspace-explorer. */
export const SIDE_PANEL_PREVIEW_TAB_ID = "__preview__";

import { isActionTraceTabId } from "@/lib/action-trace-tab-id";

export { isActionTraceTabId, isSidePanelTraceView } from "@/lib/action-trace-tab-id";

export function isSidePanelTerminalView(viewId: string): boolean {
  if (typeof viewId !== "string") return false;
  if (viewId === SIDE_PANEL_VIEW_TERMINAL) return true;
  // Legacy: extra terminal side tabs → focus the single terminal panel.
  if (viewId.startsWith(SIDE_PANEL_TERMINAL_TAB_PREFIX)) return true;
  return false;
}

/** @deprecated Internal terminal tabs only; side panel always uses SIDE_PANEL_VIEW_TERMINAL. */
export function sidePanelTerminalViewId(_terminalId: string): string {
  return SIDE_PANEL_VIEW_TERMINAL;
}

/** @deprecated Use embedded-terminal-tabs activeTerminalId instead. */
export function terminalIdFromSideView(viewId: string): string | null {
  if (!isSidePanelTerminalView(viewId)) return null;
  return DEFAULT_EMBEDDED_TERMINAL_ID;
}

export function isSidePanelEditorView(viewId: string): boolean {
  if (typeof viewId !== "string") return false;
  return (
    viewId !== SIDE_PANEL_VIEW_EXPLORER
    && !isSidePanelBrowserView(viewId)
    && viewId !== SIDE_PANEL_VIEW_TRACE
    && !isSidePanelTerminalView(viewId)
    && !isActionTraceTabId(viewId)
  );
}

/** True for the default browser view and user-created browser tabs. */
export function isSidePanelBrowserView(viewId: string): boolean {
  if (typeof viewId !== "string") return false;
  return (
    viewId === SIDE_PANEL_VIEW_BROWSER
    || viewId.startsWith(SIDE_PANEL_BROWSER_TAB_PREFIX)
  );
}

/** Side panel view id for an embedded browser instance. */
export function sidePanelBrowserViewId(browserId: string): string {
  return browserId === "default"
    ? SIDE_PANEL_VIEW_BROWSER
    : `${SIDE_PANEL_BROWSER_TAB_PREFIX}${browserId}`;
}

/** Browser instance id from a side panel view id (null when not a browser view). */
export function browserIdFromSideView(viewId: string): string | null {
  if (viewId === SIDE_PANEL_VIEW_BROWSER) return "default";
  if (viewId.startsWith(SIDE_PANEL_BROWSER_TAB_PREFIX)) {
    return viewId.slice(SIDE_PANEL_BROWSER_TAB_PREFIX.length) || null;
  }
  return null;
}
