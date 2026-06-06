"use client";

import { useCallback } from "react";
import { useWorkspaceExplorerShell } from "@/lib/workspace-explorer";
import { SIDE_PANEL_VIEW_EXPLORER } from "@/lib/workspace-side-panel-view";

/** Toggle resource explorer inside the right workspace side panel. */
export function useSidePanelExplorerToggle() {
  const {
    panelOpen,
    activeSideView,
    setPanelOpen,
    setActiveSideView,
  } = useWorkspaceExplorerShell();

  const toggle = useCallback(() => {
    if (panelOpen && activeSideView === SIDE_PANEL_VIEW_EXPLORER) {
      setPanelOpen(false);
      return;
    }
    setPanelOpen(true);
    setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
  }, [activeSideView, panelOpen, setActiveSideView, setPanelOpen]);

  const active =
    panelOpen && activeSideView === SIDE_PANEL_VIEW_EXPLORER;

  return { toggle, active };
}
