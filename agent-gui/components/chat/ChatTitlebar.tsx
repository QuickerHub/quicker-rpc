"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { SettingsGearIcon } from "@/components/SettingsGearIcon";
import type { ChatStoreData } from "@/lib/chat-store";
import {
  addThread,
  closeTab,
  getActiveThread,
  getOpenTabThreads,
  selectThread,
} from "@/lib/chat-store";
import { TitlebarThemeSwitcher } from "@/components/chat/TitlebarThemeSwitcher";
import { isAgentGuiDebugMode } from "@/lib/agent-gui-debug";
import { ExplorerPanelToggle } from "@/components/workspace/WorkspaceExplorerPanel";
import { WorkspaceExplorerFileTabs } from "@/components/workspace/WorkspaceExplorerFileTabs";
import { useDocsViewer } from "@/lib/docs-viewer";
import {
  useWorkspaceExplorerEditor,
  useWorkspaceExplorerShell,
} from "@/lib/workspace-explorer";
import { TauriWindowControls } from "@/components/shell/TauriWindowControls";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import { useShellPlatform, useTauriShell } from "@/lib/tauri-shell";

type ChatTitlebarProps = {
  store: ChatStoreData;
  settingsOpen: boolean;
  onChange: (next: ChatStoreData) => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
};

function IconChatTab() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 2.75h9a1.25 1.25 0 0 1 1.25 1.25v4.5A1.25 1.25 0 0 1 11.5 9.75H6.5L3.75 11.5V9.75h-1.5A1.25 1.25 0 0 1 1 8.5V4A1.25 1.25 0 0 1 2.25 2.75h.25Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 3.5v7M3.5 7h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M3 3l6 6M9 3L3 9"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Dev-only: link to /tool-test (icon to save titlebar width). */
function IconToolTest() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M4.25 2.5h5.5L11 5.25v6.25a.75.75 0 0 1-.75.75H3.75A.75.75 0 0 1 3 11.5V3.25A.75.75 0 0 1 3.75 2.5h.5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M6.25 7.25h1.5M7 6.5v1.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

function plainTitleText(raw: string): string {
  const withoutTags = raw.replace(/<[^>]*>/g, " ");
  const normalized = withoutTags.replace(/\s+/g, " ").trim();
  return normalized || "新对话";
}

function TitlebarChromeActions({
  isTauri,
  platform,
  showDevActions,
  settingsOpen,
  onToggleSettings,
}: {
  isTauri: boolean;
  platform: ReturnType<typeof useShellPlatform>;
  showDevActions: boolean;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}) {
  return (
    <>
      <div
        className={[
          "titlebar-actions",
          isTauri && platform !== "macos" ? "titlebar-actions--with-window-controls" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <ExplorerPanelToggle className="titlebar-action-btn ws-icon-btn" />
        {showDevActions ? (
          <>
            <span className="titlebar-actions-sep" aria-hidden />
            <div className="titlebar-actions-group" role="group" aria-label="开发工具">
              <Link
                href="/tool-test"
                className="titlebar-action-btn ws-icon-btn"
                title="工具测试（直接调用，不经 LLM）"
                aria-label="工具测试"
              >
                <IconToolTest />
              </Link>
              <TitlebarThemeSwitcher />
            </div>
          </>
        ) : null}
        <>
          {showDevActions ? <span className="titlebar-actions-sep" aria-hidden /> : null}
          <button
            type="button"
            className={`titlebar-action-btn ws-icon-btn ws-settings-trigger${settingsOpen ? " ws-settings-trigger--active" : ""}`}
            title={settingsOpen ? "关闭设置" : "设置"}
            aria-label={settingsOpen ? "关闭设置" : "打开设置"}
            aria-pressed={settingsOpen}
            onClick={onToggleSettings}
          >
            <SettingsGearIcon size={16} />
          </button>
        </>
      </div>
      <TauriWindowControls />
    </>
  );
}

export function ChatTitlebar({
  store,
  settingsOpen,
  onChange,
  onOpenSettings,
  onCloseSettings,
}: ChatTitlebarProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeThread = useMemo(() => getActiveThread(store), [store]);
  const tabThreads = useMemo(() => getOpenTabThreads(store), [store]);

  const commit = useCallback(
    (next: ChatStoreData) => {
      onChange(next);
    },
    [onChange],
  );

  const handleSelectChat = (threadId: string) => {
    if (threadId === activeThread.id) return;
    commit(selectThread(store, threadId));
  };

  const handleToggleSettings = () => {
    if (settingsOpen) {
      onCloseSettings();
    } else {
      onOpenSettings();
    }
  };

  const handleNew = () => {
    commit(addThread(store));
  };

  const handleClose = (threadId: string) => {
    commit(closeTab(store, threadId));
  };

  useEffect(() => {
    const root = tabsRef.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      if (root.scrollWidth <= root.clientWidth) return;
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      root.scrollLeft += delta;
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const root = tabsRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;

    const tabIndex = tabThreads.findIndex((t) => t.id === activeThread.id);
    const isLast = tabIndex === tabThreads.length - 1;
    const isFirst = tabIndex === 0;
    active.scrollIntoView({
      block: "nearest",
      inline: isLast ? "end" : isFirst ? "start" : "nearest",
    });
  }, [activeThread.id, tabThreads.length]);

  const { panelOpen, panelWidth } = useWorkspaceExplorerShell();
  const { activeDoc } = useDocsViewer();
  const { tabs: fileTabs } = useWorkspaceExplorerEditor();
  const showEditorPane = fileTabs.length > 0 || activeDoc != null;
  const isTauri = useTauriShell();
  const platform = useShellPlatform();
  const titlebarClass = [
    "app-titlebar",
    isTauri ? "app-titlebar--tauri" : "",
    isTauri && platform !== "macos" ? "app-titlebar--frameless" : "",
    isTauri && platform === "macos" ? "app-titlebar--mac-overlay" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showDevActions = isAgentGuiDebugMode();

  return (
    <header
      className={titlebarClass}
      style={
        panelOpen
          ? ({ "--titlebar-explorer-width": `${panelWidth}px` } as CSSProperties)
          : undefined
      }
    >
      <div className="titlebar-content-row">
        <div className="titlebar-main-column">
          <div
            className={`titlebar-main-zone${showEditorPane ? " titlebar-main-zone--editor-open" : ""}`}
          >
            <div className="titlebar-chat-zone">
              <div
                className="titlebar-tabs"
                ref={tabsRef}
                role="tablist"
                aria-label="对话"
              >
                {tabThreads.map((thread) => {
                  const active = thread.id === activeThread.id;
                  const titleText = plainTitleText(thread.title);
                  return (
                    <div
                      key={thread.id}
                      className={`titlebar-tab${active ? " titlebar-tab--active" : ""}`}
                      data-active={active ? "true" : undefined}
                    >
                      <button
                        type="button"
                        role="tab"
                        className="titlebar-tab-main"
                        aria-selected={active}
                        title={titleText}
                        onClick={() => handleSelectChat(thread.id)}
                      >
                        <span className="titlebar-tab-icon">
                          <IconChatTab />
                        </span>
                        <span className="titlebar-tab-label">{titleText}</span>
                      </button>
                      <button
                        type="button"
                        className="titlebar-tab-close"
                        aria-label={`关闭 ${titleText}`}
                        title="关闭"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClose(thread.id);
                        }}
                      >
                        <IconClose />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="titlebar-tab-new"
                  aria-label="新建对话"
                  title="新建对话"
                  onClick={handleNew}
                >
                  <IconPlus />
                </button>
              </div>
            </div>

            {showEditorPane ? (
              <div className="titlebar-editor-zone">
                <WorkspaceExplorerFileTabs />
              </div>
            ) : null}
          </div>
        </div>

        {panelOpen ? (
          <div
            className="titlebar-explorer-spacer"
            style={{ width: panelWidth, flex: `0 0 ${panelWidth}px` }}
            aria-hidden
          />
        ) : null}
      </div>

      {panelOpen ? (
        <div className="titlebar-chrome titlebar-chrome--over-explorer">
          <div className="titlebar-trailing">
            <TitlebarChromeActions
              isTauri={isTauri}
              platform={platform}
              showDevActions={showDevActions}
              settingsOpen={settingsOpen}
              onToggleSettings={handleToggleSettings}
            />
          </div>
        </div>
      ) : (
        <>
          <TitlebarDragRegion />
          <div className="titlebar-trailing">
            <TitlebarChromeActions
              isTauri={isTauri}
              platform={platform}
              showDevActions={showDevActions}
              settingsOpen={settingsOpen}
              onToggleSettings={handleToggleSettings}
            />
          </div>
        </>
      )}
    </header>
  );
}
