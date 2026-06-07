"use client";

import { useCallback } from "react";
import { getActionTraceTabs } from "@/lib/action-trace-overlay";
import { isSidePanelTraceView } from "@/lib/action-trace-tab-id";
import { useWorkspaceExplorerShell } from "@/lib/workspace-explorer";
import {
  SIDE_PANEL_VIEW_EXPLORER,
  SIDE_PANEL_VIEW_TRACE,
} from "@/lib/workspace-side-panel-view";

/** Toggle action trace view in the right workspace side panel. */
export function useSidePanelTraceToggle() {
  const {
    panelOpen,
    activeSideView,
    setPanelOpen,
    setActiveSideView,
    focusSidePanelView,
  } = useWorkspaceExplorerShell();

  const toggle = useCallback(() => {
    if (panelOpen && isSidePanelTraceView(activeSideView)) {
      setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
      return;
    }
    setPanelOpen(true);
    const traceTabs = getActionTraceTabs();
    if (traceTabs.length > 0) {
      focusSidePanelView(traceTabs[traceTabs.length - 1]!.tabId);
      return;
    }
    setActiveSideView(SIDE_PANEL_VIEW_TRACE);
  }, [
    activeSideView,
    focusSidePanelView,
    panelOpen,
    setActiveSideView,
    setPanelOpen,
  ]);

  const active = panelOpen && isSidePanelTraceView(activeSideView);

  return { toggle, active };
}
