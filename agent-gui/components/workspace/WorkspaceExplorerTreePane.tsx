"use client";

import { memo, useCallback } from "react";

import { ActionProjectTree } from "@/components/workspace/ActionProjectTree";
import {
  actionProjectDataJsonPath,
  displayNodeLabel,
  normalizeExplorerTreePath,
  type ExplorerTreeNode,
} from "@/lib/action-explorer-tree";
import { useDocsViewer } from "@/lib/docs-viewer";
import { isExplorerTreeDirectoryPath } from "@/lib/action-explorer-tree";
import {
  workspaceExplorerActionsRef,
  workspaceExplorerEditorStateRef,
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
    treeLoading,
    treeError,
    expandedPaths,
    toggleExpanded,
    selectedPath,
    setSelectedPath,
  } = useWorkspaceExplorerTree();
  const { clearActiveTopic } = useDocsViewer();

  const handleSelectDirectory = useCallback(
    (node: ExplorerTreeNode) => {
      const normalizedPath = normalizeExplorerTreePath(node.path);
      setSelectedPath(normalizedPath);
      const { activeTab, closeTab } = workspaceExplorerEditorStateRef.current;
      const tabPath = activeTab?.path
        ? normalizeExplorerTreePath(activeTab.path)
        : null;
      if (
        activeTab?.error
        || tabPath === normalizedPath
        || isExplorerTreeDirectoryPath(tree, tabPath)
      ) {
        closeTab("__preview__");
      }
    },
    [setSelectedPath, tree],
  );

  const handleSelectNode = useCallback(
    (node: ExplorerTreeNode) => {
      clearActiveTopic();
      const dataPath = actionProjectDataJsonPath(node, tree?.rootPath);
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

  if (treeLoading && !tree) {
    return <p className="workspace-explorer-hint">加载中…</p>;
  }
  if (treeError) {
    return (
      <p className="workspace-explorer-hint workspace-explorer-hint--err">{treeError}</p>
    );
  }
  if (!tree) {
    return <p className="workspace-explorer-hint">未找到 .quicker/actions</p>;
  }

  return (
    <ActionProjectTree
      rootPath={tree.rootPath}
      rootLabel={tree.rootLabel}
      cwd={cwd}
      nodes={tree.children}
      expandedPaths={expandedPaths}
      selectedPath={selectedPath}
      onToggleExpanded={toggleExpanded}
      onSelect={handleSelectNode}
      onSelectDirectory={handleSelectDirectory}
      onProjectRemoved={onProjectRemoved}
    />
  );
});
