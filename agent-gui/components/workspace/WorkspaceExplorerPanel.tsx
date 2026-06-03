"use client";



import { useCallback, useEffect, useRef, useState } from "react";

import {
  clampExplorerTreeShare,
  clampExplorerWidth,
  EXPLORER_DEFAULT_TREE_SHARE,
  EXPLORER_MAX_TREE_SHARE,
  EXPLORER_MIN_TREE_SHARE,
  loadExplorerTreeShare,
  maxExplorerWidthForLayout,
  storeExplorerTreeShare,
  storeExplorerWidth,
} from "@/lib/explorer-prefs";

import { ActionProjectTree } from "@/components/workspace/ActionProjectTree";

import { DocsCatalogTree } from "@/components/workspace/DocsCatalogTree";

import { WorkspaceExplorerEditorPane } from "@/components/workspace/WorkspaceExplorerEditorPane";

import { useDocsViewer } from "@/lib/docs-viewer";

import {
  useWorkspaceExplorer,
  useWorkspaceExplorerShell,
} from "@/lib/workspace-explorer";

import {

  actionProjectInfoJsonPath,

  type ExplorerTreeNode,

} from "@/lib/action-explorer-tree";

import { useDelayedTrue } from "@/lib/use-delayed-true";



export function WorkspaceExplorerPanel() {

  const {

    cwd,

    panelOpen,

    togglePanel,

    tree,

    treeLoading,

    treeError,

    refreshTree,

    expandedPaths,

    toggleExpanded,

    expandPath,

    selectedPath,

    setSelectedPath,

    activeTabId,

    activeTab,

    openFile,

    closeTab,

    saveWorkspaceFile,

    loadFileContent,

  } = useWorkspaceExplorer();

  const { activeDoc, clearActiveTopic } = useDocsViewer();



  const { panelWidth, setPanelWidth } = useWorkspaceExplorerShell();
  const paneSplitRef = useRef<HTMLDivElement>(null);
  // SSR/hydration: keep default until mount; localStorage differs from server default.
  const [treeShare, setTreeShare] = useState(EXPLORER_DEFAULT_TREE_SHARE);

  useEffect(() => {
    setTreeShare(loadExplorerTreeShare());
  }, []);

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

  const handlePaneResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const splitEl = paneSplitRef.current;
      if (!splitEl) return;
      const startRect = splitEl.getBoundingClientRect();
      let latestShare = treeShare;
      document.body.classList.add("workspace-explorer-pane-resizing");

      const onMove = (ev: PointerEvent) => {
        const rect = splitEl.getBoundingClientRect();
        const height = rect.height;
        if (height <= 0) return;
        const offsetY = ev.clientY - rect.top;
        latestShare = clampExplorerTreeShare(offsetY / height);
        setTreeShare(latestShare);
      };

      const onUp = () => {
        document.body.classList.remove("workspace-explorer-pane-resizing");
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        storeExplorerTreeShare(latestShare);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);

      if (startRect.height > 0) {
        const offsetY = e.clientY - startRect.top;
        latestShare = clampExplorerTreeShare(offsetY / startRect.height);
        setTreeShare(latestShare);
      }
    },
    [treeShare],
  );

  const handleProjectRemoved = useCallback(() => {

    closeTab("__preview__");

    setSelectedPath(null);

    void refreshTree();

  }, [closeTab, refreshTree, setSelectedPath]);

  const handleActionProjectSynced = useCallback(() => {
    void refreshTree();
    const path = activeTab?.path;
    if (path) void loadFileContent(path);
  }, [activeTab?.path, loadFileContent, refreshTree]);

  const handleRefreshTree = useCallback(() => {
    void refreshTree();
  }, [refreshTree]);



  const handleSelectNode = useCallback(

    (node: ExplorerTreeNode) => {

      clearActiveTopic();

      const infoPath = actionProjectInfoJsonPath(node, tree?.rootPath);

      if (infoPath) {
        setSelectedPath(node.path);
        expandPath(node.path);
        openFile(infoPath);
        return;
      }

      setSelectedPath(node.path);

      if (node.kind === "directory") {
        expandPath(node.path);
        return;
      }

      openFile(node.path);

    },

    [clearActiveTopic, expandPath, openFile, setSelectedPath, tree?.rootPath],

  );



  const showEditorSkeleton = useDelayedTrue(
    Boolean(activeTab?.loading && !activeTab?.content),
  );

  if (!panelOpen) return null;



  const showDoc = activeDoc != null;



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



      <div ref={paneSplitRef} className="workspace-explorer-pane-split">
      <div
        className="workspace-explorer-tree-pane"
        style={{ flex: `0 0 ${(treeShare * 100).toFixed(2)}%` }}
      >

        <div className="workspace-explorer-tree-section workspace-explorer-tree-section--docs">

          <DocsCatalogTree />

        </div>

        <div className="workspace-explorer-tree-section workspace-explorer-tree-section--projects">

          {treeLoading && !tree ? (

            <p className="workspace-explorer-hint">加载中…</p>

          ) : treeError ? (

            <p className="workspace-explorer-hint workspace-explorer-hint--err">{treeError}</p>

          ) : tree ? (

            <ActionProjectTree

              rootPath={tree.rootPath}

              rootLabel={tree.rootLabel}

              cwd={cwd}

              nodes={tree.children}

              expandedPaths={expandedPaths}

              selectedPath={selectedPath}

              onToggleExpanded={toggleExpanded}

              onExpandPath={expandPath}

              onSelect={handleSelectNode}

              onProjectRemoved={handleProjectRemoved}

            />

          ) : (

            <p className="workspace-explorer-hint">未找到 .quicker/actions</p>

          )}

        </div>

      </div>

      <div
        className="workspace-explorer-pane-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整树与预览区高度"
        aria-valuemin={Math.round(EXPLORER_MIN_TREE_SHARE * 100)}
        aria-valuemax={Math.round(EXPLORER_MAX_TREE_SHARE * 100)}
        aria-valuenow={Math.round(treeShare * 100)}
        onPointerDown={handlePaneResizePointerDown}
      />

      <div className="workspace-explorer-editor-pane">
        <WorkspaceExplorerEditorPane
          showDoc={showDoc}
          activeTab={activeTab}
          showEditorSkeleton={showEditorSkeleton}
          cwd={cwd}
          onSaveWorkspaceFile={saveWorkspaceFile}
          onRefreshTree={handleRefreshTree}
          onActionProjectSynced={handleActionProjectSynced}
        />
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


