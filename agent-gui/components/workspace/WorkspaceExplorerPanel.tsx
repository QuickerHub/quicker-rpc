"use client";

import { useCallback } from "react";

import { DocsCatalogTree } from "@/components/workspace/DocsCatalogTree";
import { WorkspaceExplorerTreePane } from "@/components/workspace/WorkspaceExplorerTreePane";
import {
  clampExplorerWidth,
  maxExplorerWidthForLayout,
  storeExplorerWidth,
} from "@/lib/explorer-prefs";
import {
  useWorkspaceExplorerShell,
  useWorkspaceExplorerTree,
  workspaceExplorerEditorStateRef,
} from "@/lib/workspace-explorer";

export function WorkspaceExplorerPanel() {
  const { panelOpen, togglePanel, panelWidth, setPanelWidth } =
    useWorkspaceExplorerShell();
  const { treeLoading, refreshTree, setSelectedPath } = useWorkspaceExplorerTree();

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = panelWidth;
      let latestWidth = startWidth;
      document.body.classList.add("workspace-explorer-resizing");

      const onMove = (ev: PointerEvent) => {
        const shell = document.querySelector<HTMLElement>(".app-shell");
        let maxWidth = Infinity;
        if (shell) {
          const sidebarVar = getComputedStyle(shell)
            .getPropertyValue("--ws-sidebar-width")
            .trim();
          const sidebarPx = Number.parseFloat(sidebarVar) || 0;
          maxWidth = maxExplorerWidthForLayout(
            shell.getBoundingClientRect().width,
            sidebarPx,
          );
        }
        const raw = startWidth + (startX - ev.clientX);
        latestWidth = clampExplorerWidth(Math.min(maxWidth, raw));
        setPanelWidth(latestWidth, false);
      };

      const onUp = () => {
        document.body.classList.remove("workspace-explorer-resizing");
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        storeExplorerWidth(latestWidth);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [panelWidth, setPanelWidth],
  );

  const handleProjectRemoved = useCallback(() => {
    workspaceExplorerEditorStateRef.current.closeTab("__preview__");
    setSelectedPath(null);
    void refreshTree();
  }, [refreshTree, setSelectedPath]);

  const handleRefreshTree = useCallback(() => {
    void refreshTree();
  }, [refreshTree]);

  if (!panelOpen) return null;

  return (
    <aside
      className="workspace-explorer"
      aria-label="工作区资源管理器"
      style={{ width: panelWidth, flex: `0 0 ${panelWidth}px` }}
    >
      <div
        className="workspace-explorer-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整资源管理器宽度"
        onPointerDown={handleResizePointerDown}
      />

      <div className="workspace-explorer-head">
        <span className="workspace-explorer-title">资源管理器</span>
        <div className="workspace-explorer-actions">
          <button
            type="button"
            className="workspace-explorer-action"
            onClick={() => {
              void refreshTree();
            }}
            disabled={treeLoading}
            aria-label="刷新动作项目"
            title="刷新动作项目（通常会自动同步）"
          >
            ↻
          </button>
          <button
            type="button"
            className="workspace-explorer-action"
            onClick={togglePanel}
            aria-label="收起资源管理器"
            title="收起"
          >
            ×
          </button>
        </div>
      </div>

      <div className="workspace-explorer-body">
        <div className="workspace-explorer-tree-section workspace-explorer-tree-section--docs">
          <DocsCatalogTree />
        </div>
        <div className="workspace-explorer-tree-section workspace-explorer-tree-section--projects">
          <WorkspaceExplorerTreePane onProjectRemoved={handleProjectRemoved} />
        </div>
      </div>
    </aside>
  );
}

export function ExplorerPanelToggle({
  className,
}: {
  className?: string;
}) {
  const { panelOpen, togglePanel } = useWorkspaceExplorerShell();

  return (
    <button
      type="button"
      className={`workspace-explorer-toggle${className ? ` ${className}` : ""}`}
      onClick={togglePanel}
      aria-pressed={panelOpen}
      aria-label={panelOpen ? "收起资源管理器" : "展开资源管理器"}
      title={panelOpen ? "收起资源管理器" : "展开资源管理器"}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M10 2.5H13.5V13.5H10M10 2.5H2.5V13.5H10M10 2.5V13.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M10 5v6" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </button>
  );
}
