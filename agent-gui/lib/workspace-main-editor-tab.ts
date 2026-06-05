import type { MutableRefObject } from "react";
import {
  workspaceExplorerActionsRef,
  workspaceExplorerEditorStateRef,
} from "@/lib/workspace-explorer";

const PREVIEW_TAB_ID = "__preview__";

export type WorkspaceMainEditorTabBridge = {
  openTab: (label: string) => void;
  closeTab: () => void;
  /** Clears docs viewer selection when opening a workspace file. */
  clearDoc?: () => void;
};

export const workspaceMainEditorTabBridgeRef: MutableRefObject<WorkspaceMainEditorTabBridge | null> =
  { current: null };

/** Open the right-side explorer editor (independent from chat titlebar tabs). */
export function openWorkspaceMainEditorTab(_label?: string): void {
  void _label;
  workspaceExplorerActionsRef.current.setPanelOpen(true);
}

export function closeWorkspaceMainEditorTab(): void {
  workspaceExplorerEditorStateRef.current.closeTab(PREVIEW_TAB_ID);
}

export function clearWorkspaceMainEditorDoc(): void {
  workspaceMainEditorTabBridgeRef.current?.clearDoc?.();
}
