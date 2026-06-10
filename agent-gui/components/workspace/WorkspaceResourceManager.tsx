"use client";

import { useCallback, useEffect, useState } from "react";

import { ChangedFilesList } from "@/components/workbench/ChangedFilesList";
import { WorkspacePanelViewToggle } from "@/components/workbench/WorkspacePanelViewToggle";
import { DocsCatalogTree } from "@/components/workspace/DocsCatalogTree";
import { WorkspaceExplorerTreePane } from "@/components/workspace/WorkspaceExplorerTreePane";
import {
  loadExplorerPanelView,
  storeExplorerPanelView,
  type WorkspacePanelView,
} from "@/lib/explorer-prefs";
import { useWorkspaceGitStatus } from "@/lib/workbench/use-workspace-git-status";
import { subscribeWorkbenchGitRefresh } from "@/lib/workbench/workbench-git-refresh";
import { useWorkspaceExplorerTree } from "@/lib/workspace-explorer";

type WorkspaceResourceManagerProps = {
  onProjectRemoved?: () => void;
};

/** Resource manager: git changed files + docs catalog + action/subprogram trees. */
export function WorkspaceResourceManager({
  onProjectRemoved,
}: WorkspaceResourceManagerProps) {
  const {
    cwd,
    treeLoading,
    treeChildrenLoading,
    treeWatchRevision,
    refreshTree,
  } = useWorkspaceExplorerTree();
  const [workspaceView, setWorkspaceView] = useState<WorkspacePanelView>("all");
  const [gitRefreshKey, setGitRefreshKey] = useState(0);

  const gitStatus = useWorkspaceGitStatus(
    cwd,
    gitRefreshKey + treeWatchRevision,
  );

  useEffect(() => {
    return subscribeWorkbenchGitRefresh(() => {
      setGitRefreshKey((key) => key + 1);
    });
  }, []);

  useEffect(() => {
    const trimmed = cwd.trim();
    if (!trimmed) return;
    const saved = loadExplorerPanelView(trimmed);
    setWorkspaceView(saved?.workspaceView ?? "all");
  }, [cwd]);

  const handleWorkspaceViewChange = useCallback(
    (view: WorkspacePanelView) => {
      setWorkspaceView(view);
      const trimmed = cwd.trim();
      if (trimmed) {
        storeExplorerPanelView(trimmed, { workspaceView: view });
      }
      if (view === "changed") {
        setGitRefreshKey((key) => key + 1);
      }
    },
    [cwd],
  );

  const handleRefresh = useCallback(() => {
    void refreshTree();
    setGitRefreshKey((key) => key + 1);
  }, [refreshTree]);

  return (
    <section
      className="workspace-resource-manager"
      aria-label="资源管理器"
    >
      <header className="workspace-explorer-head workspace-explorer-head--workbench">
        <span className="workspace-explorer-title">工作区</span>
        <div className="workspace-explorer-actions">
          <button
            type="button"
            className="workspace-explorer-action"
            onClick={handleRefresh}
            disabled={treeLoading || treeChildrenLoading || gitStatus.loading}
            aria-label="刷新工作区"
            title="刷新 Git 状态与动作/子程序项目"
          >
            ↻
          </button>
        </div>
      </header>

      <WorkspacePanelViewToggle
        value={workspaceView}
        changedCount={gitStatus.changedFiles.length}
        onChange={handleWorkspaceViewChange}
      />

      <div className="workspace-explorer-body">
        {workspaceView === "changed" ? (
          <div className="workspace-explorer-tree-section workspace-explorer-tree-section--changed">
            <ChangedFilesList
              files={gitStatus.changedFiles}
              loading={gitStatus.loading}
              error={gitStatus.error}
              notRepo={gitStatus.notRepo}
            />
          </div>
        ) : (
          <>
            <div className="workspace-explorer-tree-section workspace-explorer-tree-section--docs">
              <DocsCatalogTree />
            </div>
            <div className="workspace-explorer-tree-section workspace-explorer-tree-section--projects">
              <WorkspaceExplorerTreePane onProjectRemoved={onProjectRemoved} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
