import type { MutableRefObject } from "react";
import {
  workspaceExplorerActionsRef,
  workspaceExplorerEditorStateRef,
} from "@/lib/workspace-explorer";
export type WorkspaceMainEditorTabBridge = {
  openTab: (label: string) => void;
  closeTab: () => void;
  /** Clears docs viewer selection when opening a workspace file. */
  clearDoc?: () => void;
};

export const workspaceMainEditorTabBridgeRef: MutableRefObject<WorkspaceMainEditorTabBridge | null> =
  { current: null };

/** Open the right-side workspace side panel editor view. */
export function openWorkspaceMainEditorTab(_label?: string): void {
  void _label;
  const active = workspaceExplorerEditorStateRef.current.activeTab;
  if (active) {
    workspaceExplorerActionsRef.current.focusSidePanelView(active.id);
    return;
  }
  workspaceExplorerActionsRef.current.setPanelOpen(true);
}

export function closeWorkspaceMainEditorTab(): void {
  const active = workspaceExplorerEditorStateRef.current.activeTab;
  if (active) {
    workspaceExplorerEditorStateRef.current.closeTab(active.id);
  }
}

export function clearWorkspaceMainEditorDoc(): void {
  workspaceMainEditorTabBridgeRef.current?.clearDoc?.();
}
