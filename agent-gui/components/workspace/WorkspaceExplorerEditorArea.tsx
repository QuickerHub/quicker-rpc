"use client";

import { memo, useCallback, useMemo } from "react";

import { WorkspaceExplorerEditorPane } from "@/components/workspace/WorkspaceExplorerEditorPane";
import { isExplorerTreeDirectoryPath } from "@/lib/action-explorer-tree";
import { useDocsViewer } from "@/lib/docs-viewer";
import { useDelayedTrue } from "@/lib/use-delayed-true";
import {
  useWorkspaceExplorerEditor,
  useWorkspaceExplorerTree,
} from "@/lib/workspace-explorer";

/** File preview pane — subscribes to editor context (not tree expand state). */
export const WorkspaceExplorerEditorArea = memo(function WorkspaceExplorerEditorArea({
  onRefreshTree,
}: {
  onRefreshTree: () => void;
}) {
  const { activeDoc } = useDocsViewer();
  const { tree, selectedPath, refreshTree } = useWorkspaceExplorerTree();
  const { cwd, activeTab, loadFileContent, saveWorkspaceFile } = useWorkspaceExplorerEditor();

  const selectedIsDirectory = useMemo(
    () => isExplorerTreeDirectoryPath(tree, selectedPath),
    [tree, selectedPath],
  );

  const showEditorSkeleton = useDelayedTrue(
    Boolean(activeTab?.loading && !activeTab?.content),
  );

  const handleActionProjectSynced = useCallback(() => {
    void refreshTree();
    const path = activeTab?.path;
    if (path) void loadFileContent(path);
  }, [activeTab?.path, loadFileContent, refreshTree]);

  return (
    <WorkspaceExplorerEditorPane
      showDoc={activeDoc != null}
      activeTab={activeTab}
      selectedIsDirectory={selectedIsDirectory}
      showEditorSkeleton={showEditorSkeleton}
      cwd={cwd}
      onSaveWorkspaceFile={saveWorkspaceFile}
      onRefreshTree={onRefreshTree}
      onActionProjectSynced={handleActionProjectSynced}
    />
  );
});
