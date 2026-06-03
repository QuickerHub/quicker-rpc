"use client";



import { useCallback } from "react";

import { DocsViewerPanel } from "@/components/chat/DocsViewerTabs";

import { ActionProjectTree } from "@/components/workspace/ActionProjectTree";

import { DocsCatalogTree } from "@/components/workspace/DocsCatalogTree";

import { FileEditorCard } from "@/components/chat/FileEditorCard";

import { ActionProjectInfoEditor } from "@/components/workspace/ActionProjectInfoEditor";

import { isActionProjectInfoPath } from "@/lib/action-project-info-parse";

import { useDocsViewer } from "@/lib/docs-viewer";

import {
  useWorkspaceExplorer,
  useWorkspaceExplorerShell,
} from "@/lib/workspace-explorer";

import {

  actionProjectInfoJsonPath,

  type ExplorerTreeNode,

} from "@/lib/action-explorer-tree";



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



  const handleSelectNode = useCallback(

    (node: ExplorerTreeNode) => {

      clearActiveTopic();

      const infoPath = actionProjectInfoJsonPath(node, tree?.rootPath);

      if (infoPath) {

        openFile(infoPath);

        return;

      }



      setSelectedPath(node.path);

      if (node.kind === "directory") {

        toggleExpanded(node.path);

        return;

      }

      openFile(node.path);

    },

    [clearActiveTopic, openFile, setSelectedPath, toggleExpanded, tree?.rootPath],

  );



  if (!panelOpen) return null;



  const showDoc = activeDoc != null;



  return (

    <aside className="workspace-explorer" aria-label="工作区资源管理器">

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



      <div className="workspace-explorer-tree-pane">

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

              activeTabId={activeTabId}

              onToggleExpanded={toggleExpanded}

              onSelect={handleSelectNode}

              onProjectRemoved={handleProjectRemoved}

            />

          ) : (

            <p className="workspace-explorer-hint">未找到 .quicker/actions</p>

          )}

        </div>

      </div>



      <div className="workspace-explorer-editor-pane">

        {showDoc ? (

          <DocsViewerPanel />

        ) : activeTab ? (

          activeTab.error ? (

            <p className="workspace-explorer-hint workspace-explorer-hint--err">

              {activeTab.error}

            </p>

          ) : (

            <div

              className={`workspace-explorer-editor-inner${

                activeTab.loading && !activeTab.content

                  ? " workspace-explorer-editor-inner--loading"

                  : ""

              }`}

            >

              {activeTab.loading && !activeTab.content ? (

                <div

                  className="workspace-explorer-editor-skeleton"

                  aria-busy="true"

                  aria-label="加载中"

                />

              ) : null}

              {activeTab.content ? (

                isActionProjectInfoPath(activeTab.path) ? (

                  <>

                    <ActionProjectInfoEditor

                      path={activeTab.path}

                      content={activeTab.content}

                      cwd={cwd}

                      onSave={(nextContent) =>

                        saveWorkspaceFile(activeTab.path, nextContent)}

                      onSaved={() => void refreshTree()}

                      onSynced={handleActionProjectSynced}

                    />

                    {activeTab.truncated ? (

                      <p className="file-editor-footnote file-editor-footnote--warn">

                        内容已截断

                        {activeTab.totalChars !== undefined

                          ? ` · 文件共 ${activeTab.totalChars} 字符`

                          : ""}

                      </p>

                    ) : null}

                  </>

                ) : (

                  <>

                    <FileEditorCard

                      path={activeTab.path}

                      content={activeTab.content}

                      showHeader={false}

                    />

                    {activeTab.truncated ? (

                      <p className="file-editor-footnote file-editor-footnote--warn">

                        内容已截断

                        {activeTab.totalChars !== undefined

                          ? ` · 文件共 ${activeTab.totalChars} 字符`

                          : ""}

                      </p>

                    ) : null}

                  </>

                )

              ) : null}

            </div>

          )

        ) : (

          <p className="workspace-explorer-hint">选择文档或文件以预览</p>

        )}

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


