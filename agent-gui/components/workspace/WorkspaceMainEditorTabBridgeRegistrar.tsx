"use client";

import { useEffect } from "react";

import { useDocsViewer } from "@/lib/docs-viewer";
import { workspaceMainEditorTabBridgeRef } from "@/lib/workspace-main-editor-tab";

type WorkspaceMainEditorTabBridgeRegistrarProps = {
  onOpenTab: (label: string) => void;
  onCloseTab: () => void;
};

/** Wires explorer/doc open events to the main titlebar editor tab. */
export function WorkspaceMainEditorTabBridgeRegistrar({
  onOpenTab,
  onCloseTab,
}: WorkspaceMainEditorTabBridgeRegistrarProps) {
  const { clearActiveTopic } = useDocsViewer();

  useEffect(() => {
    workspaceMainEditorTabBridgeRef.current = {
      openTab: onOpenTab,
      closeTab: onCloseTab,
      clearDoc: clearActiveTopic,
    };
    return () => {
      workspaceMainEditorTabBridgeRef.current = null;
    };
  }, [onOpenTab, onCloseTab, clearActiveTopic]);

  return null;
}
