"use client";

import { useCallback, type CSSProperties } from "react";

import { WorkspaceEmbeddedBrowser } from "@/components/browser/WorkspaceEmbeddedBrowser";
import { WorkspaceEmbeddedTerminal } from "@/components/terminal/WorkspaceEmbeddedTerminal";
import { ActionTracePanel } from "@/components/action-trace/ActionTracePanel";
import { WorkspaceExplorerEditorArea } from "@/components/workspace/WorkspaceExplorerEditorArea";
import { WorkspaceResourceManager } from "@/components/workspace/WorkspaceResourceManager";
import { dispatchWorkspaceLayoutResize } from "@/lib/embedded-webview-bounds";
import { storeChatColumnWidth } from "@/lib/explorer-prefs";
import { useEmbeddedTerminal } from "@/lib/embedded-terminal-context";
import {
  browserIdFromSideView,
  isSidePanelBrowserView,
  isSidePanelEditorView,
  isSidePanelTerminalView,
  isSidePanelTraceView,
  SIDE_PANEL_VIEW_EXPLORER,
  SIDE_PANEL_VIEW_TRACE,
} from "@/lib/workspace-side-panel-view";
import { isActionProjectDataPath } from "@/lib/action-project-data-parse";
import {
  useWorkspaceExplorerEditor,
  useWorkspaceExplorerShell,
  workspaceExplorerActionsRef,
} from "@/lib/workspace-explorer";

export function WorkspaceExplorerPanel() {
  const { panelOpen, chatColumnWidth, setChatColumnWidth, activeSideView } =
    useWorkspaceExplorerShell();
  const { activeTab } = useWorkspaceExplorerEditor();
  const { open: defaultTerminalOpen } = useEmbeddedTerminal();

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || chatColumnWidth == null) return;
      e.preventDefault();
      const splitHost = e.currentTarget.closest<HTMLElement>(".app-main-body");
      if (!splitHost) return;

      const startX = e.clientX;
      const startChatWidth = chatColumnWidth;
      let latestChatWidth = startChatWidth;
      document.body.classList.add("workspace-explorer-resizing");

      const onMove = (ev: PointerEvent) => {
        const containerWidth = splitHost.getBoundingClientRect().width;
        if (containerWidth <= 0) return;
        latestChatWidth = startChatWidth + (ev.clientX - startX);
        setChatColumnWidth(latestChatWidth, containerWidth, false);
        dispatchWorkspaceLayoutResize();
      };

      const onUp = () => {
        document.body.classList.remove("workspace-explorer-resizing");
        dispatchWorkspaceLayoutResize();
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const containerWidth = splitHost.getBoundingClientRect().width;
        if (containerWidth > 0) {
          storeChatColumnWidth(latestChatWidth, containerWidth);
        }
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [chatColumnWidth, setChatColumnWidth],
  );

  const handleProjectRemoved = useCallback(() => {
    workspaceExplorerActionsRef.current.notifyProjectRemoved();
  }, []);

  if (!panelOpen) return null;

  const showBrowser = isSidePanelBrowserView(activeSideView);
  const activeBrowserId = showBrowser
    ? browserIdFromSideView(activeSideView)
    : null;
  const showTrace = isSidePanelTraceView(activeSideView);
  const traceTabId =
    showTrace && activeSideView !== SIDE_PANEL_VIEW_TRACE
      ? activeSideView
      : null;
  const terminalPanelVisible = isSidePanelTerminalView(activeSideView);
  const terminalMounted = defaultTerminalOpen;
  const showEditor = isSidePanelEditorView(activeSideView);
  const activeTabPath = activeTab?.path;
  const actionDataEditorOpen =
    showEditor
    && Boolean(activeTabPath)
    && isActionProjectDataPath(activeTabPath);
  const showWorkspaceTree =
    activeSideView === SIDE_PANEL_VIEW_EXPLORER || showEditor;
  const showTreePanel =
    showWorkspaceTree
    && !showBrowser
    && !showTrace
    && !terminalPanelVisible
    && !actionDataEditorOpen;
  const splitTreeAndEditor = showEditor && showTreePanel;

  return (
    <aside
      className="workspace-explorer workspace-side-panel"
      aria-label="工作区侧栏"
    >
      <div
        className="workspace-explorer-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧栏宽度"
        onPointerDown={handleResizePointerDown}
      />

      <div
        className={`workspace-side-panel-body${splitTreeAndEditor ? " workspace-side-panel-body--split-editor" : ""}`}
      >
        {showTreePanel ? (
          <div
            className={`workspace-side-panel-tree${splitTreeAndEditor ? " workspace-side-panel-tree--compact" : ""}`}
          >
            <WorkspaceResourceManager onProjectRemoved={handleProjectRemoved} />
          </div>
        ) : null}

        {showBrowser && activeBrowserId ? (
          <WorkspaceEmbeddedBrowser
            key={activeBrowserId}
            browserId={activeBrowserId}
          />
        ) : null}

        {showTrace ? (
          <div className="workspace-side-panel-trace">
            <ActionTracePanel
              tabId={traceTabId}
              className="action-trace-panel--side"
            />
          </div>
        ) : null}

        {terminalMounted ? (
          <div
            className="workspace-side-panel-terminal"
            hidden={!terminalPanelVisible ? true : undefined}
          >
            <WorkspaceEmbeddedTerminal />
          </div>
        ) : null}

        {showEditor ? (
          <div
            className={`workspace-side-panel-editor workspace-main-editor workspace-main-editor--fill${actionDataEditorOpen ? " workspace-side-panel-editor--action-data" : ""}`}
          >
            <WorkspaceExplorerEditorArea
              onRefreshTree={() => {
                workspaceExplorerActionsRef.current.refreshTree();
              }}
            />
          </div>
        ) : null}
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
      aria-label={panelOpen ? "收起工作区侧栏" : "展开工作区侧栏"}
      title={
        panelOpen
          ? "收起侧栏（资源管理、浏览器、终端、文件预览）"
          : "展开侧栏（资源管理、浏览器、终端、文件预览）"
      }
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
