"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ActionDesignerThreadRef } from "@/lib/action-designer-thread";
import type { ChatStoreData } from "@/lib/chat-store";
import {
  addThread,
  closeTab,
  getActiveThread,
  getOpenTabThreads,
} from "@/lib/chat-store";
import { activateThreadWithLazyHydration } from "@/lib/chat-thread-activation";
import { getChatStoreSnapshotSync } from "@/lib/use-chat-store";
import { plainTitleText } from "@/lib/plain-title-text";
import {
  clearThreadNeedsAttention,
  getThreadAttentionVersion,
  isThreadNeedsAttention,
  subscribeThreadAttention,
} from "@/lib/thread-attention";
import { DesktopWindowControls } from "@/components/shell/DesktopWindowControls";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import { TitlebarThemeSwitcher } from "@/components/chat/TitlebarThemeSwitcher";
import {
  useDesktopShell,
  useDesktopShellKind,
  useNativeWindowControlsOverlay,
  useShellPlatform,
} from "@/lib/desktop-shell";
import { useDevExperienceEnabled } from "@/lib/release-preview.client";

type ChatTitlebarProps = {
  store: ChatStoreData;
  onChange: (next: ChatStoreData) => void;
  /** When set, new tabs are tagged for this ActionDesigner window. */
  actionDesigner?: ActionDesignerThreadRef;
  /** Compact tabs for ActionDesigner WebView2 embed. */
  designerEmbed?: boolean;
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

function TitlebarWindowControls({ isDesktop }: { isDesktop: boolean }) {
  if (!isDesktop) return null;
  return <DesktopWindowControls />;
}

export function ChatTitlebar({
  store,
  onChange,
  actionDesigner,
  designerEmbed = false,
}: ChatTitlebarProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeThread = useMemo(() => getActiveThread(store), [store]);
  const tabThreads = useMemo(() => getOpenTabThreads(store), [store]);
  useSyncExternalStore(
    subscribeThreadAttention,
    getThreadAttentionVersion,
    () => 0,
  );

  const commit = useCallback(
    (next: ChatStoreData) => {
      onChange(next);
    },
    [onChange],
  );

  const handleSelectChat = (threadId: string) => {
    if (threadId === activeThread.id) return;
    clearThreadNeedsAttention(threadId);
    activateThreadWithLazyHydration({
      threadId,
      mode: "select",
      onStoreChange: commit,
      getStore: getChatStoreSnapshotSync,
    });
  };

  const handleNew = () => {
    commit(
      addThread(
        store,
        actionDesigner ? { actionDesigner } : undefined,
      ),
    );
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

  const isDesktop = useDesktopShell();
  const shellKind = useDesktopShellKind();
  const platform = useShellPlatform();
  const usesNativeWco = useNativeWindowControlsOverlay();
  const devExperienceEnabled = useDevExperienceEnabled();
  const showTitlebarTrailing = isDesktop || devExperienceEnabled;
  const titlebarClass = [
    "app-titlebar",
    "app-titlebar--tabs-only",
    designerEmbed ? "app-titlebar--designer-embed" : "",
    shellKind === "tauri" ? "app-titlebar--tauri" : "",
    shellKind === "electron" ? "app-titlebar--electron" : "",
    isDesktop && platform !== "macos" ? "app-titlebar--frameless" : "",
    usesNativeWco ? "app-titlebar--electron-wco" : "",
    isDesktop && platform === "macos" ? "app-titlebar--mac-overlay" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={titlebarClass}>
      <div className="titlebar-content-row">
        <div className="titlebar-main-column">
          <div className="titlebar-main-zone">
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
                  const needsAttention =
                    !active && isThreadNeedsAttention(thread.id);
                  return (
                    <div
                      key={thread.id}
                      className={`titlebar-tab${active ? " titlebar-tab--active" : ""}${needsAttention ? " titlebar-tab--attention" : ""}`}
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
                        {needsAttention ? (
                          <span
                            className="titlebar-tab-attention"
                            aria-label="有新消息"
                          />
                        ) : null}
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
                {!designerEmbed ? (
                  <TitlebarDragRegion className="titlebar-drag-fill" />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showTitlebarTrailing ? (
        <div className="titlebar-trailing titlebar-trailing--window-controls">
          <div
            className={[
              "titlebar-actions",
              isDesktop && platform !== "macos" && !usesNativeWco
                ? "titlebar-actions--with-window-controls"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <TitlebarThemeSwitcher />
            <TitlebarWindowControls isDesktop={isDesktop} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
