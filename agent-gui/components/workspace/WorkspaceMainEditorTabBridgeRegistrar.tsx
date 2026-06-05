"use client";

import { useEffect } from "react";

import { useDocsViewer } from "@/lib/docs-viewer";
import { workspaceMainEditorTabBridgeRef } from "@/lib/workspace-main-editor-tab";
import {
  workspaceExplorerActionsRef,
  workspaceExplorerEditorStateRef,
} from "@/lib/workspace-explorer";

const PREVIEW_TAB_ID = "__preview__";

/** Wires doc/file open helpers to the explorer panel (not chat titlebar tabs). */
export function WorkspaceMainEditorTabBridgeRegistrar() {
  const { clearActiveTopic } = useDocsViewer();

  useEffect(() => {
    workspaceMainEditorTabBridgeRef.current = {
      openTab: () => {
        workspaceExplorerActionsRef.current.setPanelOpen(true);
      },
      closeTab: () => {
        workspaceExplorerEditorStateRef.current.closeTab(PREVIEW_TAB_ID);
      },
      clearDoc: clearActiveTopic,
    };
    return () => {
      workspaceMainEditorTabBridgeRef.current = null;
    };
  }, [clearActiveTopic]);

  return null;
}
