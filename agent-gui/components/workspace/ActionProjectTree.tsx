"use client";



import { memo, useCallback } from "react";

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

  ExplorerImportSpinner,

  ExplorerRootIcon,

  ExplorerTreeChevron,

} from "@/components/workspace/ExplorerTreeIcons";

import {

  isActionProjectImportingInMap,

  useActionProjectImportStore,

} from "@/lib/action-project-import-state";

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

          <span className={`explorer-tree-icon${isDir ? " explorer-tree-icon--dir" : " explorer-tree-icon--file"}${importing ? " explorer-tree-icon--busy" : ""}`}>

            {importing ? (

              <ExplorerImportSpinner />

            ) : isDir ? (

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

      {isDir && expanded

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

  const path = prev.node.path;

  return prev.expandedPaths.has(path) === next.expandedPaths.has(path);

}



const MemoTreeNodeRow = memo(TreeNodeRow, treeNodeRowPropsEqual);



type ActionProjectTreeProps = {

  rootPath: string;

  rootLabel: string;

  cwd: string;

  nodes: ExplorerTreeNode[];

  expandedPaths: Set<string>;

  selectedPath: string | null;

  onToggleExpanded: (path: string) => void;

  onExpandPath: (path: string) => void;

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

  onToggleExpanded,

  onExpandPath,

  onSelect,

  onProjectRemoved,

}: ActionProjectTreeProps) {

  const importStore = useActionProjectImportStore();

  const rootExpanded = expandedPaths.has(rootPath);



  const resolveImporting = useCallback(

    (node: ExplorerTreeNode) =>

      isActionProjectImportingInMap(importStore, node.actionId),

    [importStore],

  );



  return (

    <div className="explorer-tree">

      <button

        type="button"

        className="explorer-tree-row explorer-tree-row--root"

        onClick={() => onExpandPath(rootPath)}

      >

        <span
          className="explorer-tree-chevron-hit"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpanded(rootPath);
          }}
          role="presentation"
        >
          <ExplorerTreeChevron expanded={rootExpanded} />
        </span>

        <span className="explorer-tree-icon explorer-tree-icon--root">

          <ExplorerRootIcon expanded={rootExpanded} />

        </span>

        <span className="explorer-tree-name">{rootLabel}</span>

        <span className="explorer-tree-meta">{nodes.length} 项</span>

      </button>

      {rootExpanded

        ? nodes.map((node) => (

            <MemoTreeNodeRow

              key={node.path}

              node={node}

              depth={1}

              rootPath={rootPath}

              cwd={cwd}

              expandedPaths={expandedPaths}

              selectedPath={selectedPath}

              importing={resolveImporting(node)}

              onToggleExpanded={onToggleExpanded}

              onSelect={onSelect}

              onProjectRemoved={onProjectRemoved}

            />

          ))

        : null}

    </div>

  );

});


