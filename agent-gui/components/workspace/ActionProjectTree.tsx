"use client";



import { memo } from "react";

import type { ExplorerTreeNode } from "@/lib/action-explorer-tree";

import {

  displayNodeLabel,

  displayNodeSubtitle,

  explorerProgramDataJsonPath,

  isActionProjectFolderNode,

  isActionProjectRootNode,

  isEmbeddedSubProgramRootNode,

  isExplorerTreePathExpanded,

  normalizeExplorerTreePath,

} from "@/lib/action-explorer-tree";

import {

  ExplorerFileIcon,

  ExplorerFolderIcon,

  ExplorerImportSpinner,

  ExplorerRootIcon,

  ExplorerTreeChevron,

} from "@/components/workspace/ExplorerTreeIcons";

import { useActionProjectImporting } from "@/lib/action-project-import-state";

import { ActionProjectTreeDelete } from "@/components/workspace/ActionProjectTreeDelete";



type TreeNodeProps = {

  node: ExplorerTreeNode;

  depth: number;

  rootPath: string;

  cwd: string;

  expandedPaths: Set<string>;

  selectedPath: string | null;

  importing: boolean;

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

  importing,

  onToggleExpanded,

  onSelect,

  onProjectRemoved,

}: TreeNodeProps) {

  const isFolderRow = isActionProjectFolderNode(node);

  const isProjectRoot = isActionProjectRootNode(node, rootPath);

  const isSubProgramRoot = isEmbeddedSubProgramRootNode(node);

  const isProgramRoot = isProjectRoot || isSubProgramRoot;

  const hasTitle = isFolderRow && (Boolean(node.title?.trim()) || isProgramRoot);

  const nodePath = normalizeExplorerTreePath(node.path);
  const expanded = isExplorerTreePathExpanded(expandedPaths, nodePath);

  const dataJsonPath = explorerProgramDataJsonPath(node, rootPath);

  const selected =

    selectedPath === nodePath

    || (dataJsonPath !== null && selectedPath === dataJsonPath);

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

          onClick={() => {
            if (isFolderRow) {
              onToggleExpanded(nodePath);
              if (isProgramRoot) {
                onSelect(node);
              }
              return;
            }
            onSelect(node);
          }}

          title={

            node.title

              ? `${node.title}\n${node.path}`

              : node.path

          }

        >

          {isFolderRow ? (

            <span

              className="explorer-tree-chevron-hit"

              onClick={(e) => {

                e.stopPropagation();

                onToggleExpanded(nodePath);

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

          <span className={`explorer-tree-icon${isFolderRow ? " explorer-tree-icon--dir" : " explorer-tree-icon--file"}${importing ? " explorer-tree-icon--busy" : ""}`}>

            {importing ? (

              <ExplorerImportSpinner />

            ) : isFolderRow ? (

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

      {isFolderRow && expanded

        ? node.children?.map((child) => (

            <MemoTreeNodeRow

              key={child.path}

              node={child}

              depth={depth + 1}

              rootPath={rootPath}

              cwd={cwd}

              expandedPaths={expandedPaths}

              selectedPath={selectedPath}

              importing={false}

              onToggleExpanded={onToggleExpanded}

              onSelect={onSelect}

              onProjectRemoved={onProjectRemoved}

            />

          ))

        : null}

    </>
  );
}

function treeNodeRowPropsEqual(prev: TreeNodeProps, next: TreeNodeProps): boolean {

  if (prev.node !== next.node) return false;

  if (prev.depth !== next.depth) return false;

  if (prev.rootPath !== next.rootPath) return false;

  if (prev.cwd !== next.cwd) return false;

  if (prev.importing !== next.importing) return false;

  if (prev.selectedPath !== next.selectedPath) return false;

  if (prev.onToggleExpanded !== next.onToggleExpanded) return false;

  if (prev.onSelect !== next.onSelect) return false;

  if (prev.onProjectRemoved !== next.onProjectRemoved) return false;

  if (prev.expandedPaths !== next.expandedPaths) return false;

  return true;

}



const MemoTreeNodeRow = memo(TreeNodeRow, treeNodeRowPropsEqual);

type ProjectTreeNodeRowProps = Omit<TreeNodeProps, "importing">;

/** Subscribes to import state only for this action project row. */
function ActionProjectTreeProjectRow(props: ProjectTreeNodeRowProps) {
  const importing = useActionProjectImporting(
    isActionProjectRootNode(props.node, props.rootPath)
      ? props.node.actionId
      : undefined,
  );
  return <MemoTreeNodeRow {...props} importing={importing} />;
}

type ActionProjectTreeProps = {

  rootPath: string;

  rootLabel: string;

  cwd: string;

  nodes: ExplorerTreeNode[];

  expandedPaths: Set<string>;

  selectedPath: string | null;

  childrenLoading?: boolean;

  onToggleExpanded: (path: string) => void;

  onSelect: (node: ExplorerTreeNode) => void;

  onProjectRemoved?: () => void;

};



export const ActionProjectTree = memo(function ActionProjectTree({

  rootPath,

  rootLabel,

  cwd,

  nodes,

  expandedPaths,

  selectedPath,

  childrenLoading = false,

  onToggleExpanded,

  onSelect,

  onProjectRemoved,

}: ActionProjectTreeProps) {
  const normalizedRootPath = normalizeExplorerTreePath(rootPath);
  const rootExpanded = isExplorerTreePathExpanded(expandedPaths, normalizedRootPath);

  return (

    <div className="explorer-tree">

      <button

        type="button"

        className="explorer-tree-row explorer-tree-row--root"

        onClick={() => onToggleExpanded(normalizedRootPath)}

      >

        <span
          className="explorer-tree-chevron-hit"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpanded(normalizedRootPath);
          }}
          role="presentation"
        >
          <ExplorerTreeChevron expanded={rootExpanded} />
        </span>

        <span className="explorer-tree-icon explorer-tree-icon--root">

          <ExplorerRootIcon expanded={rootExpanded} />

        </span>

        <span className="explorer-tree-name">{rootLabel}</span>

        <span className="explorer-tree-meta">
          {childrenLoading && nodes.length === 0 ? "…" : `${nodes.length} 项`}
        </span>

      </button>

      {rootExpanded

        ? childrenLoading && nodes.length === 0
          ? (
              <p className="workspace-explorer-hint workspace-explorer-hint--nested">
                加载中…
              </p>
            )
          : nodes.map((node) => (
            <ActionProjectTreeProjectRow
              key={node.path}
              node={node}
              depth={1}
              rootPath={rootPath}
              cwd={cwd}
              expandedPaths={expandedPaths}
              selectedPath={selectedPath}
              onToggleExpanded={onToggleExpanded}
              onSelect={onSelect}
              onProjectRemoved={onProjectRemoved}
            />
          ))

        : null}

    </div>

  );

});


