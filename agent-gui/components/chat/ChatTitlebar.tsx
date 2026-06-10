"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ChatStoreData } from "@/lib/chat-store";
import {
  addThread,
  closeTab,
  getActiveThread,
  getOpenTabThreads,
  hydrateStoreThreadMessagesAsync,
  selectThread,
} from "@/lib/chat-store";
import { plainTitleText } from "@/lib/plain-title-text";
import { TauriWindowControls } from "@/components/shell/TauriWindowControls";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import { TitlebarThemeSwitcher } from "@/components/chat/TitlebarThemeSwitcher";
import { useShellPlatform, useTauriShell } from "@/lib/tauri-shell";
import { useDevExperienceEnabled } from "@/lib/release-preview.client";

type ChatTitlebarProps = {
  store: ChatStoreData;
  onChange: (next: ChatStoreData) => void;
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

function TitlebarWindowControls({ isTauri }: { isTauri: boolean }) {
  if (!isTauri) return null;
  return <TauriWindowControls />;
}

export function ChatTitlebar({
  store,
  onChange,
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
    void (async () => {
      let next = selectThread(store, threadId);
      next = await hydrateStoreThreadMessagesAsync(next, threadId);
      commit(next);
    })();
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

  const isTauri = useTauriShell();
  const platform = useShellPlatform();
  const devExperienceEnabled = useDevExperienceEnabled();
  const showTitlebarTrailing = isTauri || devExperienceEnabled;
  const titlebarClass = [
    "app-titlebar",
    "app-titlebar--tabs-only",
    isTauri ? "app-titlebar--tauri" : "",
    isTauri && platform !== "macos" ? "app-titlebar--frameless" : "",
    isTauri && platform === "macos" ? "app-titlebar--mac-overlay" : "",
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
                <TitlebarDragRegion className="titlebar-drag-fill" />
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
              isTauri && platform !== "macos"
                ? "titlebar-actions--with-window-controls"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <TitlebarThemeSwitcher />
            <TitlebarWindowControls isTauri={isTauri} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
