"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ChatStoreData } from "@/lib/chat-store";
import {
  addThread,
  deleteThread,
  getActiveThread,
  saveChatStore,
  selectThread,
} from "@/lib/chat-store";
import { SidebarSettingsMenu } from "@/components/chat/SidebarSettingsMenu";
import { SidebarToggle } from "@/components/chat/SidebarToggle";

type ChatTitlebarProps = {
  store: ChatStoreData;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
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

export function ChatTitlebar({
  store,
  sidebarOpen,
  onToggleSidebar,
  onChange,
}: ChatTitlebarProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeThread = useMemo(() => getActiveThread(store), [store]);
  const tabThreads = store.threads;
  const canCloseTab = store.threads.length > 1;

  const commit = useCallback(
    (next: ChatStoreData) => {
      saveChatStore(next);
      onChange(next);
    },
    [onChange],
  );

  const handleSelect = (threadId: string) => {
    if (threadId === activeThread.id) return;
    commit(selectThread(store, threadId));
  };

  const handleNew = () => {
    commit(addThread(store));
  };

  const handleClose = (threadId: string) => {
    if (!canCloseTab) return;
    commit(deleteThread(store, threadId));
  };

  useEffect(() => {
    const root = tabsRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeThread.id, tabThreads.length]);

  return (
    <header className="app-titlebar">
      <SidebarToggle
        sidebarOpen={sidebarOpen}
        onClick={onToggleSidebar}
        className="shell-sidebar-toggle"
      />

      <div className="titlebar-tabs" ref={tabsRef} role="tablist" aria-label="对话标签">
        {tabThreads.map((thread) => {
          const active = thread.id === activeThread.id;
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
                title={thread.title}
                onClick={() => handleSelect(thread.id)}
              >
                <span className="titlebar-tab-icon">
                  <IconChatTab />
                </span>
                <span className="titlebar-tab-label">{thread.title}</span>
              </button>
              {canCloseTab && (
                <button
                  type="button"
                  className="titlebar-tab-close"
                  aria-label={`关闭 ${thread.title}`}
                  title="关闭"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose(thread.id);
                  }}
                >
                  <IconClose />
                </button>
              )}
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

      <div className="titlebar-actions">
        <SidebarSettingsMenu />
      </div>
    </header>
  );
}
