"use client";

import { useEffect } from "react";

import { useDocsViewer } from "@/lib/docs-viewer";
import { workspaceMainEditorTabBridgeRef } from "@/lib/workspace-main-editor-tab";
import {
  workspaceExplorerActionsRef,
  workspaceExplorerEditorStateRef,
} from "@/lib/workspace-explorer";

/** Wires doc/file open helpers to the explorer panel (not chat titlebar tabs). */
export function WorkspaceMainEditorTabBridgeRegistrar() {
  const { clearActiveTopic } = useDocsViewer();

  useEffect(() => {
    workspaceMainEditorTabBridgeRef.current = {
      openTab: () => {
        workspaceExplorerActionsRef.current.setPanelOpen(true);
      },
      closeTab: () => {
        const active = workspaceExplorerEditorStateRef.current.activeTab;
        if (active) {
          workspaceExplorerEditorStateRef.current.closeTab(active.id);
        }
      },
      clearDoc: clearActiveTopic,
    };
    return () => {
      workspaceMainEditorTabBridgeRef.current = null;
    };
  }, [clearActiveTopic]);

  return null;
}
