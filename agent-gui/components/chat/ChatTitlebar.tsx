"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { SettingsGearIcon } from "@/components/SettingsGearIcon";
import type { AppMainView } from "@/lib/app-main-view";
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
import { useDocsViewer } from "@/lib/docs-viewer";
import { ExplorerPanelToggle } from "@/components/workspace/WorkspaceExplorerPanel";
import { TauriWindowControls } from "@/components/shell/TauriWindowControls";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import { useShellPlatform, useTauriShell } from "@/lib/tauri-shell";

type ChatTitlebarProps = {
  store: ChatStoreData;
  mainView: AppMainView;
  settingsTabOpen: boolean;
  workspaceEditorTabOpen: boolean;
  workspaceEditorTabLabel: string;
  onChange: (next: ChatStoreData) => void;
  onMainViewChange: (view: AppMainView) => void;
  onOpenSettingsTab: () => void;
  onCloseSettingsTab: () => void;
  onSelectWorkspaceEditor: () => void;
  onCloseWorkspaceEditorTab: () => void;
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

function IconFileTab() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M4 1.75h3.25L10.5 4.75V11.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M7.25 1.75V5H10.5" stroke="currentColor" strokeWidth="1.15" strokeLinejoin="round" />
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

function plainTitleText(raw: string): string {
  const withoutTags = raw.replace(/<[^>]*>/g, " ");
  const normalized = withoutTags.replace(/\s+/g, " ").trim();
  return normalized || "新对话";
}

export function ChatTitlebar({
  store,
  mainView,
  settingsTabOpen,
  workspaceEditorTabOpen,
  workspaceEditorTabLabel,
  onChange,
  onMainViewChange,
  onOpenSettingsTab,
  onCloseSettingsTab,
  onSelectWorkspaceEditor,
  onCloseWorkspaceEditorTab,
}: ChatTitlebarProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const { clearActiveTopic } = useDocsViewer();
  const activeThread = useMemo(() => getActiveThread(store), [store]);
  const tabThreads = useMemo(() => getOpenTabThreads(store), [store]);
  const settingsActive = mainView === "settings";
  const workspaceEditorActive = mainView === "workspace-editor" && workspaceEditorTabOpen;

  const commit = useCallback(
    (next: ChatStoreData) => {
      onChange(next);
    },
    [onChange],
  );

  const handleSelectChat = (threadId: string) => {
    onMainViewChange("chat");
    if (threadId === activeThread.id && mainView === "chat") return;
    commit(selectThread(store, threadId));
  };

  const handleSelectWorkspaceEditor = () => {
    if (!workspaceEditorTabOpen) return;
    onSelectWorkspaceEditor();
  };

  const handleCloseWorkspaceEditor = () => {
    clearActiveTopic();
    onCloseWorkspaceEditorTab();
  };

  const handleSelectSettings = () => {
    if (!settingsTabOpen) {
      onOpenSettingsTab();
      return;
    }
    if (settingsActive) return;
    onMainViewChange("settings");
  };

  const handleNew = () => {
    onMainViewChange("chat");
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

    if (settingsActive) {
      active.scrollIntoView({ block: "nearest", inline: "end" });
      return;
    }

    if (workspaceEditorActive) {
      active.scrollIntoView({ block: "nearest", inline: "end" });
      return;
    }

    const tabIndex = tabThreads.findIndex((t) => t.id === activeThread.id);
    const isLast = tabIndex === tabThreads.length - 1;
    const isFirst = tabIndex === 0;
    active.scrollIntoView({
      block: "nearest",
      inline: isLast ? "end" : isFirst ? "start" : "nearest",
    });
  }, [activeThread.id, tabThreads.length, settingsActive, settingsTabOpen, workspaceEditorActive, workspaceEditorTabOpen]);

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

  return (
    <header className={titlebarClass}>
      <div className="titlebar-tabs" ref={tabsRef} role="tablist" aria-label="主标签">
        {tabThreads.map((thread) => {
          const active = !settingsActive && !workspaceEditorActive && thread.id === activeThread.id;
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

        {workspaceEditorTabOpen ? (
          <div
            className={`titlebar-tab titlebar-tab--workspace${workspaceEditorActive ? " titlebar-tab--active" : ""}`}
            data-active={workspaceEditorActive ? "true" : undefined}
            data-tab-kind="workspace-editor"
          >
            <button
              type="button"
              role="tab"
              className="titlebar-tab-main"
              aria-selected={workspaceEditorActive}
              title={workspaceEditorTabLabel}
              onClick={handleSelectWorkspaceEditor}
            >
              <span className="titlebar-tab-icon">
                <IconFileTab />
              </span>
              <span className="titlebar-tab-label">{workspaceEditorTabLabel}</span>
            </button>
            <button
              type="button"
              className="titlebar-tab-close"
              aria-label={`关闭 ${workspaceEditorTabLabel}`}
              title="关闭"
              onClick={(e) => {
                e.stopPropagation();
                handleCloseWorkspaceEditor();
              }}
            >
              <IconClose />
            </button>
          </div>
        ) : null}

        {settingsTabOpen && (
          <div
            className={`titlebar-tab titlebar-tab--settings${settingsActive ? " titlebar-tab--active" : ""}`}
            data-active={settingsActive ? "true" : undefined}
            data-tab-kind="settings"
          >
            <button
              type="button"
              role="tab"
              className="titlebar-tab-main"
              aria-selected={settingsActive}
              title="设置"
              onClick={handleSelectSettings}
            >
              <span className="titlebar-tab-icon">
                <SettingsGearIcon size={12} />
              </span>
              <span className="titlebar-tab-label">设置</span>
            </button>
            <button
              type="button"
              className="titlebar-tab-close"
              aria-label="关闭设置"
              title="关闭"
              onClick={(e) => {
                e.stopPropagation();
                onCloseSettingsTab();
              }}
            >
              <IconClose />
            </button>
          </div>
        )}

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

      <TitlebarDragRegion />

      <div
        className={[
          "titlebar-actions",
          isTauri && platform !== "macos" ? "titlebar-actions--with-window-controls" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <ExplorerPanelToggle className="ws-icon-btn" />
        {isAgentGuiDebugMode() ? <TitlebarThemeSwitcher /> : null}
        {!settingsTabOpen && (
          <button
            type="button"
            className="ws-icon-btn ws-settings-trigger"
            title="设置"
            aria-label="打开设置"
            onClick={onOpenSettingsTab}
          >
            <SettingsGearIcon size={16} />
          </button>
        )}
      </div>
      <TauriWindowControls />
    </header>
  );
}
