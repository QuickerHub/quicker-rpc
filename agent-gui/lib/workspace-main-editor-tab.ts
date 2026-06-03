import type { MutableRefObject } from "react";

export type WorkspaceMainEditorTabBridge = {
  openTab: (label: string) => void;
  closeTab: () => void;
  /** Clears docs viewer selection when opening a workspace file. */
  clearDoc?: () => void;
};

export const workspaceMainEditorTabBridgeRef: MutableRefObject<WorkspaceMainEditorTabBridge | null> =
  { current: null };

export function openWorkspaceMainEditorTab(label: string): void {
  workspaceMainEditorTabBridgeRef.current?.openTab(label.trim() || "文件");
}

export function closeWorkspaceMainEditorTab(): void {
  workspaceMainEditorTabBridgeRef.current?.closeTab();
}

export function clearWorkspaceMainEditorDoc(): void {
  workspaceMainEditorTabBridgeRef.current?.clearDoc?.();
}
