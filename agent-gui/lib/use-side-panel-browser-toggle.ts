"use client";

import { useCallback } from "react";
import { useEmbeddedBrowser } from "@/lib/embedded-browser-context";
import { useWorkspaceExplorerShell } from "@/lib/workspace-explorer";
import {
  SIDE_PANEL_VIEW_BROWSER,
  SIDE_PANEL_VIEW_EXPLORER,
} from "@/lib/workspace-side-panel-view";

/** Toggle embedded browser inside the right workspace side panel. */
export function useSidePanelBrowserToggle() {
  const { open: browserOpen, setOpen: setBrowserOpen } = useEmbeddedBrowser();
  const {
    panelOpen,
    activeSideView,
    setPanelOpen,
    setActiveSideView,
  } = useWorkspaceExplorerShell();

  const toggle = useCallback(() => {
    if (
      browserOpen
      && panelOpen
      && activeSideView === SIDE_PANEL_VIEW_BROWSER
    ) {
      setBrowserOpen(false);
      setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
      return;
    }
    setPanelOpen(true);
    setBrowserOpen(true);
    setActiveSideView(SIDE_PANEL_VIEW_BROWSER);
  }, [
    activeSideView,
    browserOpen,
    panelOpen,
    setActiveSideView,
    setBrowserOpen,
    setPanelOpen,
  ]);

  const active =
    browserOpen
    && panelOpen
    && activeSideView === SIDE_PANEL_VIEW_BROWSER;

  return { toggle, active, browserOpen };
}
