"use client";

import { memo } from "react";

import { WorkspaceExplorerEditorArea } from "@/components/workspace/WorkspaceExplorerEditorArea";

/** Full-width workspace file / doc editor in the main content column. */
export const WorkspaceMainEditorPanel = memo(function WorkspaceMainEditorPanel({
  onRefreshTree,
}: {
  onRefreshTree: () => void;
}) {
  return (
    <div className="workspace-main-editor workspace-main-editor--fill">
      <WorkspaceExplorerEditorArea onRefreshTree={onRefreshTree} />
    </div>
  );
});
