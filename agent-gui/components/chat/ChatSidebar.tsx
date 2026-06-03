"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { WorkingDirectoryDialog } from "@/components/chat/WorkingDirectoryDialog";
import type { ChatStoreData } from "@/lib/chat-store";
import {
  addThread,
  deleteThread,
  getActiveThread,
  renameThread,
  setWorkingDirectory,
  sortThreads,
} from "@/lib/chat-store";
import type { DefaultWorkingDirectoryProfile } from "@/lib/default-working-directory";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import { nativeConfirm } from "@/lib/native-confirm";

function defaultCwdFallbackLabel(profile: DefaultWorkingDirectoryProfile): string {
  switch (profile) {
    case "repo":
      return "默认（quicker-rpc 仓库根）";
    case "documents":
      return "默认（文档/QuickerAgent）";
    case "env":
      return "默认（已配置）";
    default:
      return "默认";
  }
}

type ChatSidebarProps = {
  store: ChatStoreData;
  defaultCwd: string;
  defaultCwdProfile: DefaultWorkingDirectoryProfile;
  onChange: (next: ChatStoreData) => void;
  onActivateThread: (threadId: string) => void;
  onShowChatView: () => void;
  disabled?: boolean;
};

function shortPath(path: string, fallback: string): string {
  const trimmed = path.trim();
  const display = trimmed || fallback;
  if (display.length <= 28) return display;
  return `…${display.slice(-26)}`;
}

function IconPlus() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M6 2v8M2 6h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2.5 3.5h7M4.5 3.5V2.5h3v1M5 5.5v3M7 5.5v3M3.5 3.5l.5 6h4l.5-6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type RowActionProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
};

function RowAction({ label, onClick, disabled, children }: RowActionProps) {
  return (
    <button
      type="button"
      className="ws-icon-btn ws-row-action-btn"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function ChatSidebar({
  store,
  defaultCwd,
  defaultCwdProfile,
  onChange,
  onActivateThread,
  onShowChatView,
  disabled = false,
}: ChatSidebarProps) {
  const activeThread = useMemo(() => getActiveThread(store), [store]);
  const sortedThreads = useMemo(() => sortThreads(store.threads), [store.threads]);
  const effectiveCwd = store.workingDirectory.trim() || defaultCwd;
  const cwdFallbackLabel = defaultCwd
    ? defaultCwdFallbackLabel(defaultCwdProfile)
    : "未设置";
  const [cwdDialogOpen, setCwdDialogOpen] = useState(false);

  const commit = useCallback(
    (next: ChatStoreData) => {
      onChange(next);
    },
    [onChange],
  );

  const handleNewThread = () => {
    commit(addThread(store));
    onShowChatView();
  };

  const handleRenameThread = (threadId: string, currentTitle: string) => {
    const title = window.prompt("对话标题", currentTitle);
    if (title === null || !title.trim()) return;
    commit(renameThread(store, threadId, title));
  };

  const handleDeleteThread = (threadId: string) => {
    void (async () => {
      if (!(await nativeConfirm("删除此对话？"))) return;
      commit(deleteThread(store, threadId));
    })();
  };

  return (
    <aside className="workspace-sidebar" aria-label="对话侧栏">
      <div className="workspace-sidebar-inner">
        <div className="ws-section ws-section--grow ws-section--rail-primary">
          <div className="ws-section-head ws-section-head--titlebar">
            <span className="ws-section-title">对话</span>
            <TitlebarDragRegion className="ws-section-head-drag" />
            <button
              type="button"
              className="ws-icon-btn"
              onClick={handleNewThread}
              disabled={disabled}
              title="新建对话"
              aria-label="新建对话"
            >
              <IconPlus />
            </button>
          </div>
          <ul className="ws-list ws-list--scroll" role="listbox" aria-label="对话列表">
            {sortedThreads.map((thread) => {
              const selected = thread.id === activeThread.id;
              return (
                <li
                  key={thread.id}
                  className={`ws-row${selected ? " ws-row--active" : ""}`}
                >
                  <button
                    type="button"
                    className={`ws-item${selected ? " ws-item--active" : ""}`}
                    onClick={() => onActivateThread(thread.id)}
                    disabled={disabled}
                    aria-selected={selected}
                  >
                    <span className="ws-item-label">{thread.title}</span>
                    {thread.messages.length > 0 && (
                      <span className="ws-item-badge">{thread.messages.length}</span>
                    )}
                  </button>
                  <div className="ws-row-actions">
                    <RowAction
                      label="重命名对话"
                      onClick={() => handleRenameThread(thread.id, thread.title)}
                      disabled={disabled}
                    >
                      <IconPencil />
                    </RowAction>
                    <RowAction
                      label="删除对话"
                      onClick={() => handleDeleteThread(thread.id)}
                      disabled={disabled}
                    >
                      <IconTrash />
                    </RowAction>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="ws-footer">
          <button
            type="button"
            className="ws-footer-path"
            onClick={() => setCwdDialogOpen(true)}
            disabled={disabled}
            title={effectiveCwd || "点击设置工作目录"}
            aria-haspopup="dialog"
          >
            <span className="ws-footer-path-label">工作目录</span>
            <span className="ws-footer-path-value">
              {shortPath(store.workingDirectory, cwdFallbackLabel)}
            </span>
          </button>
        </div>
      </div>

      <WorkingDirectoryDialog
        open={cwdDialogOpen}
        disabled={disabled}
        value={store.workingDirectory}
        defaultCwd={defaultCwd}
        defaultCwdProfile={defaultCwdProfile}
        onClose={() => setCwdDialogOpen(false)}
        onSave={(path) => commit(setWorkingDirectory(store, path))}
      />
    </aside>
  );
}

