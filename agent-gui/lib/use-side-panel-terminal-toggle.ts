"use client";

import { useCallback } from "react";
import { useEmbeddedTerminal } from "@/lib/embedded-terminal-context";
import { useWorkspaceExplorerShell } from "@/lib/workspace-explorer";
import {
  isSidePanelTerminalView,
  SIDE_PANEL_VIEW_EXPLORER,
  SIDE_PANEL_VIEW_TERMINAL,
} from "@/lib/workspace-side-panel-view";

/** Toggle embedded terminal inside the right workspace side panel. */
export function useSidePanelTerminalToggle() {
  const { open: terminalOpen, setOpen: setTerminalOpen } = useEmbeddedTerminal();
  const {
    panelOpen,
    activeSideView,
    setPanelOpen,
    setActiveSideView,
  } = useWorkspaceExplorerShell();

  const toggle = useCallback(() => {
    if (
      terminalOpen
      && panelOpen
      && isSidePanelTerminalView(activeSideView)
    ) {
      setTerminalOpen(false);
      setActiveSideView(SIDE_PANEL_VIEW_EXPLORER);
      return;
    }
    setPanelOpen(true);
    setTerminalOpen(true);
    setActiveSideView(SIDE_PANEL_VIEW_TERMINAL);
  }, [
    activeSideView,
    panelOpen,
    setActiveSideView,
    setPanelOpen,
    setTerminalOpen,
    terminalOpen,
  ]);

  const active =
    terminalOpen
    && panelOpen
    && isSidePanelTerminalView(activeSideView);

  return { toggle, active, terminalOpen };
}
