"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { WorkingDirectoryDialog } from "@/components/chat/WorkingDirectoryDialog";
import type { ChatStoreData } from "@/lib/chat-store";
import {
  addThread,
  addWorkspace,
  deleteThread,
  defaultWorkspaceLabel,
  getActiveWorkspace,
  removeWorkspace,
  renameThread,
  resolveStoreWorkingDirectory,
  selectWorkspace,
  setWorkspaceRootPath,
  sortThreads,
  threadMessageCount,
  threadsForWorkspace,
  tryRestoreLegacyChatStore,
} from "@/lib/chat-store";
import { pushAppMessage } from "@/lib/app-messages";
import { fetchLegacyChatStoreCandidatesFromDisk } from "@/lib/legacy-chat-restore-client";
import type { DefaultWorkingDirectoryProfile } from "@/lib/default-working-directory";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import { nativeConfirm } from "@/lib/native-confirm";

function defaultCwdFallbackLabel(profile: DefaultWorkingDirectoryProfile): string {
  switch (profile) {
    case "repo":
      return "默认（quicker-rpc 仓库根）";
    case "documents":
      return "默认（文档/QuickerAgent/workspace）";
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
  defaultCwdReady?: boolean;
  onChange: (next: ChatStoreData) => void;
  onActivateThread: (threadId: string) => void;
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

function IconFolder() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M1.5 3h3l1 1.2H10.5V9.5H1.5V3Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M6 2.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M6 4v2.2l1.4.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 2.5H2v1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
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
  defaultCwdReady = true,
  onChange,
  onActivateThread,
  disabled = false,
}: ChatSidebarProps) {
  const activeWorkspace = useMemo(() => getActiveWorkspace(store), [store]);
  const cwdFallbackLabel = !defaultCwdReady
    ? "…"
    : defaultCwd
      ? defaultCwdFallbackLabel(defaultCwdProfile)
      : "未设置";
  const workspaceThreads = useMemo(
    () => sortThreads(threadsForWorkspace(store.threads, store.activeWorkspaceId)),
    [store.threads, store.activeWorkspaceId],
  );
  const effectiveCwd = resolveStoreWorkingDirectory(store, defaultCwd);
  const [cwdDialogOpen, setCwdDialogOpen] = useState(false);
  const [addWorkspaceDialogOpen, setAddWorkspaceDialogOpen] = useState(false);
  const [restoringLegacy, setRestoringLegacy] = useState(false);

  const commit = useCallback(
    (next: ChatStoreData) => {
      onChange(next);
    },
    [onChange],
  );

  const handleNewThread = () => {
    commit(addThread(store, { workspaceId: store.activeWorkspaceId }));
  };

  const handleSelectWorkspace = (workspaceId: string) => {
    if (workspaceId === store.activeWorkspaceId) return;
    const next = selectWorkspace(store, workspaceId);
    commit(next);
    onActivateThread(next.activeThreadId);
  };

  const handleAddWorkspace = (rootPath: string) => {
    const next = addWorkspace(store, rootPath);
    commit(next);
    onActivateThread(next.activeThreadId);
  };

  const handleRemoveWorkspace = (workspaceId: string) => {
    void (async () => {
      if (!(await nativeConfirm("移除此工作区？对话将合并到其它工作区。", { danger: true }))) {
        return;
      }
      const next = removeWorkspace(store, workspaceId);
      commit(next);
      onActivateThread(next.activeThreadId);
    })();
  };

  const handleRenameThread = (threadId: string, currentTitle: string) => {
    const title = window.prompt("对话标题", currentTitle);
    if (title === null || !title.trim()) return;
    commit(renameThread(store, threadId, title));
  };

  const handleDeleteThread = (threadId: string) => {
    void (async () => {
      if (!(await nativeConfirm("删除此对话？", { danger: true }))) return;
      commit(deleteThread(store, threadId));
    })();
  };

  const handleRestoreLegacy = () => {
    if (restoringLegacy) return;
    setRestoringLegacy(true);
    void (async () => {
      try {
        const disk = await fetchLegacyChatStoreCandidatesFromDisk();
        const { next, result } = tryRestoreLegacyChatStore(
          store,
          disk.candidates,
          { scannedRoots: disk.scannedRoots },
        );
        pushAppMessage({
          kind: result.ok ? "success" : "warning",
          title: result.title,
          body: result.body,
          autoDismissMs: result.ok ? 8000 : 14000,
        });
        if (result.ok) {
          commit(next);
          const firstImported = next.threads.find((t) => t.messages.length > 0);
          if (firstImported) onActivateThread(firstImported.id);
        }
      } finally {
        setRestoringLegacy(false);
      }
    })();
  };

  return (
    <aside className="workspace-sidebar" aria-label="对话侧栏">
      <div className="workspace-sidebar-inner">
        <div className="ws-section ws-section--workspaces">
          <div className="ws-section-head">
            <span className="ws-section-title">工作区</span>
            <button
              type="button"
              className="ws-icon-btn"
              onClick={() => setAddWorkspaceDialogOpen(true)}
              disabled={disabled}
              title="添加工作区"
              aria-label="添加工作区"
            >
              <IconFolder />
            </button>
          </div>
          <ul className="ws-list ws-workspace-list" role="listbox" aria-label="工作区列表">
            {store.workspaces.map((workspace) => {
              const selected = workspace.id === store.activeWorkspaceId;
              const label = defaultWorkspaceLabel(workspace, cwdFallbackLabel);
              const threadCount = threadsForWorkspace(store.threads, workspace.id).length;
              return (
                <li
                  key={workspace.id}
                  className={`ws-row ws-workspace-row${selected ? " ws-row--active" : ""}`}
                >
                  <button
                    type="button"
                    className={`ws-item ws-workspace-item${selected ? " ws-item--active" : ""}`}
                    onClick={() => handleSelectWorkspace(workspace.id)}
                    disabled={disabled}
                    aria-selected={selected}
                    title={workspace.rootPath.trim() || effectiveCwd}
                  >
                    <span className="ws-item-label">{label}</span>
                    {threadCount > 0 && (
                      <span className="ws-item-badge">{threadCount}</span>
                    )}
                  </button>
                  {store.workspaces.length > 1 ? (
                    <div className="ws-row-actions">
                      <RowAction
                        label="移除工作区"
                        onClick={() => handleRemoveWorkspace(workspace.id)}
                        disabled={disabled}
                      >
                        <IconTrash />
                      </RowAction>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

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
            {workspaceThreads.map((thread) => {
              const selected = thread.id === store.activeThreadId;
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
                    {threadMessageCount(thread) > 0 && (
                      <span className="ws-item-badge">{threadMessageCount(thread)}</span>
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
          <div className="ws-list-restore">
            <button
              type="button"
              className="ws-restore-btn"
              onClick={handleRestoreLegacy}
              disabled={disabled || restoringLegacy}
              title="扫描本机 WebView LevelDB 与 localStorage，合并旧版/其它 origin 的对话"
              aria-label="从老版本恢复对话"
            >
              <IconHistory />
              <span>{restoringLegacy ? "正在恢复…" : "从老版本恢复…"}</span>
            </button>
          </div>
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
              {shortPath(activeWorkspace.rootPath, cwdFallbackLabel)}
            </span>
          </button>
        </div>
      </div>

      <WorkingDirectoryDialog
        open={cwdDialogOpen}
        disabled={disabled}
        value={activeWorkspace.rootPath}
        defaultCwd={defaultCwd}
        defaultCwdProfile={defaultCwdProfile}
        onClose={() => setCwdDialogOpen(false)}
        onSave={(path) =>
          commit(setWorkspaceRootPath(store, store.activeWorkspaceId, path))
        }
      />

      <WorkingDirectoryDialog
        open={addWorkspaceDialogOpen}
        disabled={disabled}
        value=""
        defaultCwd={defaultCwd}
        defaultCwdProfile={defaultCwdProfile}
        onClose={() => setAddWorkspaceDialogOpen(false)}
        onSave={(path) => {
          handleAddWorkspace(path);
          setAddWorkspaceDialogOpen(false);
        }}
      />
    </aside>
  );
}
