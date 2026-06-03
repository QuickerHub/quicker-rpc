"use client";

import type { ExplorerTreeNode } from "@/lib/action-explorer-tree";
import {
  actionProjectInfoJsonPath,
  displayNodeLabel,
  displayNodeSubtitle,
  isActionProjectRootNode,
} from "@/lib/action-explorer-tree";
import {
  ExplorerFileIcon,
  ExplorerFolderIcon,
  ExplorerRootIcon,
  ExplorerTreeChevron,
} from "@/components/workspace/ExplorerTreeIcons";
import { ActionProjectTreeDelete } from "@/components/workspace/ActionProjectTreeDelete";

type TreeNodeProps = {
  node: ExplorerTreeNode;
  depth: number;
  rootPath: string;
  cwd: string;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  activeTabId: string | null;
  onToggleExpanded: (path: string) => void;
  onSelect: (node: ExplorerTreeNode) => void;
  onProjectRemoved?: () => void;
};

function TreeNodeRow({
  node,
  depth,
  rootPath,
  cwd,
  expandedPaths,
  selectedPath,
  activeTabId,
  onToggleExpanded,
  onSelect,
  onProjectRemoved,
}: TreeNodeProps) {
  const isDir = node.kind === "directory";
  const isProjectRoot = isActionProjectRootNode(node, rootPath);
  const hasTitle = isDir && (Boolean(node.title?.trim()) || isProjectRoot);
  const expanded = expandedPaths.has(node.path);
  const infoJsonPath = actionProjectInfoJsonPath(node, rootPath);
  const selected =
    selectedPath === node.path
    || (infoJsonPath !== null && selectedPath === infoJsonPath);
  const label = displayNodeLabel(node, rootPath);
  const subtitle = displayNodeSubtitle(node, rootPath);

  return (
    <>
      <div
        className={`explorer-tree-line${selected ? " explorer-tree-line--selected" : ""}`}
      >
        <button
          type="button"
          className={`explorer-tree-row${selected ? " explorer-tree-row--selected" : ""}`}
          style={{ paddingLeft: `${0.45 + depth * 0.85}rem` }}
          onClick={() => onSelect(node)}
          title={
            node.title
              ? `${node.title}\n${node.path}`
              : node.path
          }
        >
          {isDir ? (
            <span
              className="explorer-tree-chevron-hit"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpanded(node.path);
              }}
              role="presentation"
            >
              <ExplorerTreeChevron
                expanded={expanded}
                hidden={!node.children?.length}
              />
            </span>
          ) : (
            <ExplorerTreeChevron hidden />
          )}
          <span className={`explorer-tree-icon${isDir ? " explorer-tree-icon--dir" : " explorer-tree-icon--file"}`}>
            {isDir ? (
              <ExplorerFolderIcon expanded={expanded} />
            ) : (
              <ExplorerFileIcon name={node.name} />
            )}
          </span>
          <span className="explorer-tree-label">
            <span className={`explorer-tree-name${hasTitle ? " explorer-tree-name--title" : ""}`}>{label}</span>
            {subtitle ? (
              <span className="explorer-tree-sub">{subtitle}</span>
            ) : null}
          </span>
        </button>
        {isProjectRoot ? (
          <ActionProjectTreeDelete
            node={node}
            rootPath={rootPath}
            cwd={cwd}
            onDeleted={onProjectRemoved}
          />
        ) : null}
      </div>
      {isDir && expanded && node.children?.map((child) => (
        <TreeNodeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          rootPath={rootPath}
          cwd={cwd}
          expandedPaths={expandedPaths}
          selectedPath={selectedPath}
          activeTabId={activeTabId}
          onToggleExpanded={onToggleExpanded}
          onSelect={onSelect}
          onProjectRemoved={onProjectRemoved}
        />
      ))}
    </>
  );
}

type ActionProjectTreeProps = {
  rootPath: string;
  rootLabel: string;
  cwd: string;
  nodes: ExplorerTreeNode[];
  expandedPaths: Set<string>;
  selectedPath: string | null;
  activeTabId: string | null;
  onToggleExpanded: (path: string) => void;
  onSelect: (node: ExplorerTreeNode) => void;
  onProjectRemoved?: () => void;
};

export function ActionProjectTree({
  rootPath,
  rootLabel,
  cwd,
  nodes,
  expandedPaths,
  selectedPath,
  activeTabId,
  onToggleExpanded,
  onSelect,
  onProjectRemoved,
}: ActionProjectTreeProps) {
  const rootExpanded = expandedPaths.has(rootPath);

  return (
    <div className="explorer-tree">
      <button
        type="button"
        className="explorer-tree-row explorer-tree-row--root"
        onClick={() => onToggleExpanded(rootPath)}
      >
        <ExplorerTreeChevron expanded={rootExpanded} />
        <span className="explorer-tree-icon explorer-tree-icon--root">
          <ExplorerRootIcon expanded={rootExpanded} />
        </span>
        <span className="explorer-tree-name">{rootLabel}</span>
        <span className="explorer-tree-meta">{nodes.length} 项</span>
      </button>
      {rootExpanded && nodes.map((node) => (
        <TreeNodeRow
          key={node.path}
          node={node}
          depth={1}
          rootPath={rootPath}
          cwd={cwd}
          expandedPaths={expandedPaths}
          selectedPath={selectedPath}
          activeTabId={activeTabId}
          onToggleExpanded={onToggleExpanded}
          onSelect={onSelect}
          onProjectRemoved={onProjectRemoved}
        />
      ))}
    </div>
  );
}
