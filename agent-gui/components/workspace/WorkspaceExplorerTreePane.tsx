"use client";

import { memo, useCallback } from "react";

import { ActionProjectTree } from "@/components/workspace/ActionProjectTree";
import {
  displayNodeLabel,
  explorerProgramDataJsonPath,
  normalizeExplorerTreePath,
  type ExplorerTreeNode,
} from "@/lib/action-explorer-tree";
import { useDocsViewer } from "@/lib/docs-viewer";
import {
  workspaceExplorerActionsRef,
  useWorkspaceExplorerTree,
} from "@/lib/workspace-explorer";

/** Action-project tree — subscribes to tree context only (not editor tabs). */
export const WorkspaceExplorerTreePane = memo(function WorkspaceExplorerTreePane({
  onProjectRemoved,
}: {
  onProjectRemoved?: () => void;
}) {
  const {
    cwd,
    tree,
    treeChildrenLoading,
    treeError,
    expandedPaths,
    toggleExpanded,
    selectedPath,
    setSelectedPath,
  } = useWorkspaceExplorerTree();
  const { clearActiveTopic } = useDocsViewer();

  const handleSelectNode = useCallback(
    (node: ExplorerTreeNode) => {
      clearActiveTopic();
      const dataPath = explorerProgramDataJsonPath(node, tree?.rootPath);
      const normalizedPath = normalizeExplorerTreePath(node.path);
      setSelectedPath(normalizedPath);
      const { openFile } = workspaceExplorerActionsRef.current;
      if (dataPath) {
        openFile(dataPath, undefined, {
          revealInTree: false,
          tabLabel: displayNodeLabel(node, tree?.rootPath),
        });
        return;
      }
      if (node.kind === "directory") return;
      openFile(normalizedPath);
    },
    [clearActiveTopic, setSelectedPath, tree?.rootPath],
  );

  if (treeError && !tree) {
    return (
      <p className="workspace-explorer-hint workspace-explorer-hint--err">{treeError}</p>
    );
  }
  if (!tree) {
    return <p className="workspace-explorer-hint">未找到 .quicker/actions</p>;
  }

  return (
    <>
      {treeError ? (
        <p className="workspace-explorer-hint workspace-explorer-hint--err workspace-explorer-hint--nested">
          {treeError}
        </p>
      ) : null}
      <ActionProjectTree
        rootPath={tree.rootPath}
        rootLabel={tree.rootLabel}
        cwd={cwd}
        nodes={tree.children}
        childrenLoading={treeChildrenLoading}
        expandedPaths={expandedPaths}
        selectedPath={selectedPath}
        onToggleExpanded={toggleExpanded}
        onSelect={handleSelectNode}
        onProjectRemoved={onProjectRemoved}
      />
    </>
  );
});
