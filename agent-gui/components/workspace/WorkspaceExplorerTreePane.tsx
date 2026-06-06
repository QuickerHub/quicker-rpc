"use client";

import { memo, useCallback, useEffect, useState } from "react";

import { ActionProjectTree } from "@/components/workspace/ActionProjectTree";
import {
  ExplorerFolderIcon,
  ExplorerTreeChevron,
} from "@/components/workspace/ExplorerTreeIcons";
import {
  displayNodeLabel,
  explorerProgramDataJsonPath,
  normalizeExplorerTreePath,
  type ExplorerTreeNode,
} from "@/lib/action-explorer-tree";
import { loadExplorerPanelView, storeExplorerPanelView } from "@/lib/explorer-prefs";
import { useDocsViewer } from "@/lib/docs-viewer";
import {
  workspaceExplorerActionsRef,
  useWorkspaceExplorerTree,
} from "@/lib/workspace-explorer";

type WorkspaceExplorerTreePaneProps = {
  onProjectRemoved?: () => void;
};

/** Collapsible projects block (default collapsed); inner trees + watch errors only when expanded. */
export const WorkspaceExplorerTreePane = memo(function WorkspaceExplorerTreePane({
  onProjectRemoved,
}: WorkspaceExplorerTreePaneProps) {
  const { cwd, tree, subprogramTree, treeChildrenLoading } = useWorkspaceExplorerTree();
  const [sectionExpanded, setSectionExpanded] = useState(false);

  useEffect(() => {
    const trimmed = cwd.trim();
    if (!trimmed) return;
    const saved = loadExplorerPanelView(trimmed);
    setSectionExpanded(saved?.projectsExpanded ?? false);
  }, [cwd]);

  const toggleSectionExpanded = useCallback(() => {
    setSectionExpanded((value) => {
      const next = !value;
      const trimmed = cwd.trim();
      if (trimmed) {
        storeExplorerPanelView(trimmed, { projectsExpanded: next });
      }
      return next;
    });
  }, [cwd]);

  const projectCount =
    (tree?.children.length ?? 0) + (subprogramTree?.children.length ?? 0);

  return (
    <div
      className={`explorer-tree explorer-tree--projects-section${
        sectionExpanded ? " explorer-tree--projects-section-expanded" : ""
      }`}
    >
      <button
        type="button"
        className="explorer-tree-row explorer-tree-row--root"
        onClick={toggleSectionExpanded}
        aria-expanded={sectionExpanded}
      >
        <ExplorerTreeChevron expanded={sectionExpanded} />
        <span className="explorer-tree-icon explorer-tree-icon--dir">
          <ExplorerFolderIcon expanded={sectionExpanded} />
        </span>
        <span className="explorer-tree-name">动作/子程序</span>
        <span className="explorer-tree-meta">
          {treeChildrenLoading && projectCount === 0
            ? "…"
            : `${projectCount} 项`}
        </span>
      </button>
      {sectionExpanded ? (
        <WorkspaceExplorerTreePaneBody onProjectRemoved={onProjectRemoved} />
      ) : null}
    </div>
  );
});

const WorkspaceExplorerTreePaneBody = memo(function WorkspaceExplorerTreePaneBody({
  onProjectRemoved,
}: WorkspaceExplorerTreePaneProps) {
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
