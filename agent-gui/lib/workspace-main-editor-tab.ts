import type { MutableRefObject } from "react";
import {
  workspaceExplorerActionsRef,
  workspaceExplorerEditorStateRef,
} from "@/lib/workspace-explorer";
import { SIDE_PANEL_PREVIEW_TAB_ID } from "@/lib/workspace-side-panel-view";

const PREVIEW_TAB_ID = SIDE_PANEL_PREVIEW_TAB_ID;

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
  workspaceExplorerActionsRef.current.focusSidePanelView(PREVIEW_TAB_ID);
}

export function closeWorkspaceMainEditorTab(): void {
  workspaceExplorerEditorStateRef.current.closeTab(PREVIEW_TAB_ID);
}

export function clearWorkspaceMainEditorDoc(): void {
  workspaceMainEditorTabBridgeRef.current?.clearDoc?.();
}
