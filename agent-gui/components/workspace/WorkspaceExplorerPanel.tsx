"use client";

import { useCallback, type CSSProperties } from "react";

import { WorkspaceEmbeddedBrowser } from "@/components/browser/WorkspaceEmbeddedBrowser";
import { WorkspaceExplorerEditorArea } from "@/components/workspace/WorkspaceExplorerEditorArea";
import { WorkspaceResourceManager } from "@/components/workspace/WorkspaceResourceManager";
import { dispatchWorkspaceLayoutResize } from "@/lib/embedded-webview-bounds";
import { storeChatColumnWidth } from "@/lib/explorer-prefs";
import {
  isSidePanelEditorView,
  SIDE_PANEL_VIEW_BROWSER,
  SIDE_PANEL_VIEW_EXPLORER,
} from "@/lib/workspace-side-panel-view";
import {
  useWorkspaceExplorerShell,
  workspaceExplorerActionsRef,
} from "@/lib/workspace-explorer";

export function WorkspaceExplorerPanel() {
  const { panelOpen, chatColumnWidth, setChatColumnWidth, activeSideView } =
    useWorkspaceExplorerShell();

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

  const showExplorer = activeSideView === SIDE_PANEL_VIEW_EXPLORER;
  const showBrowser = activeSideView === SIDE_PANEL_VIEW_BROWSER;
  const showEditor = isSidePanelEditorView(activeSideView);

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

      <div className="workspace-side-panel-body">
        {showExplorer ? (
          <WorkspaceResourceManager onProjectRemoved={handleProjectRemoved} />
        ) : null}

        {showBrowser ? (
          <WorkspaceEmbeddedBrowser />
        ) : null}

        {showEditor ? (
          <div className="workspace-side-panel-editor workspace-main-editor workspace-main-editor--fill">
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
          ? "收起侧栏（资源管理、浏览器、文件预览）"
          : "展开侧栏（资源管理、浏览器、文件预览）"
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
