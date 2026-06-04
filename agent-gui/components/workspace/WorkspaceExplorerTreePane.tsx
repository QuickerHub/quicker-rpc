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

/** Action + global subprogram project trees. */
export const WorkspaceExplorerTreePane = memo(function WorkspaceExplorerTreePane({
  onProjectRemoved,
}: {
  onProjectRemoved?: () => void;
}) {
  const {
    cwd,
    tree,
    subprogramTree,
    treeChildrenLoading,
    treeError,
    expandedPaths,
    toggleExpanded,
    selectedPath,
    setSelectedPath,
  } = useWorkspaceExplorerTree();
  const { clearActiveTopic } = useDocsViewer();

  const handleSelectNode = useCallback(
    (node: ExplorerTreeNode, rootPath?: string) => {
      clearActiveTopic();
      const dataPath = explorerProgramDataJsonPath(node, rootPath ?? tree?.rootPath);
      const normalizedPath = normalizeExplorerTreePath(node.path);
      setSelectedPath(normalizedPath);
      const { openFile } = workspaceExplorerActionsRef.current;
      if (dataPath) {
        openFile(dataPath, undefined, {
          revealInTree: false,
          tabLabel: displayNodeLabel(node, rootPath ?? tree?.rootPath),
        });
        return;
      }
      if (node.kind === "directory") return;
      openFile(normalizedPath);
    },
    [clearActiveTopic, setSelectedPath, tree?.rootPath],
  );

  if (treeError && !tree && !subprogramTree) {
    return (
      <p className="workspace-explorer-hint workspace-explorer-hint--err">{treeError}</p>
    );
  }
  if (!tree || !subprogramTree) {
    return <p className="workspace-explorer-hint">未找到 .quicker 工程目录</p>;
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
        onSelect={(node) => handleSelectNode(node, tree.rootPath)}
        onProjectRemoved={onProjectRemoved}
      />
      <ActionProjectTree
        rootPath={subprogramTree.rootPath}
        rootLabel={subprogramTree.rootLabel}
        cwd={cwd}
        nodes={subprogramTree.children}
        childrenLoading={treeChildrenLoading}
        expandedPaths={expandedPaths}
        selectedPath={selectedPath}
        onToggleExpanded={toggleExpanded}
        onSelect={(node) => handleSelectNode(node, subprogramTree.rootPath)}
        onProjectRemoved={onProjectRemoved}
      />
    </>
  );
});
