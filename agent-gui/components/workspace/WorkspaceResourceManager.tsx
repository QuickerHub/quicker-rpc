"use client";

import { DocsCatalogTree } from "@/components/workspace/DocsCatalogTree";
import { WorkspaceExplorerTreePane } from "@/components/workspace/WorkspaceExplorerTreePane";
import { useWorkspaceExplorerTree } from "@/lib/workspace-explorer";

type WorkspaceResourceManagerProps = {
  onProjectRemoved?: () => void;
};

/** Resource manager: docs catalog + action/subprogram project trees. */
export function WorkspaceResourceManager({
  onProjectRemoved,
}: WorkspaceResourceManagerProps) {
  const { treeLoading, treeChildrenLoading, refreshTree } = useWorkspaceExplorerTree();

  return (
    <section
      className="workspace-resource-manager"
      aria-label="资源管理"
    >
      <header className="workspace-explorer-head">
        <span className="workspace-explorer-title">资源管理</span>
        <div className="workspace-explorer-actions">
          <button
            type="button"
            className="workspace-explorer-action"
            onClick={() => {
              void refreshTree();
            }}
            disabled={treeLoading || treeChildrenLoading}
            aria-label="刷新工程目录"
            title="刷新动作/子程序项目"
          >
            ↻
          </button>
        </div>
      </header>

      <div className="workspace-explorer-body">
        <div className="workspace-explorer-tree-section workspace-explorer-tree-section--docs">
          <DocsCatalogTree />
        </div>
        <div className="workspace-explorer-tree-section workspace-explorer-tree-section--projects">
          <WorkspaceExplorerTreePane onProjectRemoved={onProjectRemoved} />
        </div>
      </div>
    </section>
  );
}
