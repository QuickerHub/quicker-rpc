/** Pinned explorer tree tab in the right workspace side panel. */
export const SIDE_PANEL_VIEW_EXPLORER = "__side_explorer__";

/** Embedded agent browser tab in the right workspace side panel. */
export const SIDE_PANEL_VIEW_BROWSER = "__side_browser__";

/** Action trace stream in the right workspace side panel. */
export const SIDE_PANEL_VIEW_TRACE = "__side_trace__";

/** Matches workspace file preview tab id in workspace-explorer. */
export const SIDE_PANEL_PREVIEW_TAB_ID = "__preview__";

import { isActionTraceTabId } from "@/lib/action-trace-tab-id";

export { isActionTraceTabId, isSidePanelTraceView } from "@/lib/action-trace-tab-id";

export function isSidePanelEditorView(viewId: string): boolean {
  return (
    viewId !== SIDE_PANEL_VIEW_EXPLORER
    && viewId !== SIDE_PANEL_VIEW_BROWSER
    && viewId !== SIDE_PANEL_VIEW_TRACE
    && !isActionTraceTabId(viewId)
  );
}
