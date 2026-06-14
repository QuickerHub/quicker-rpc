"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { WorkingDirectoryDialog } from "@/components/chat/WorkingDirectoryDialog";
import type { ChatStoreData } from "@/lib/chat-store";
import {
  addThread,
  deleteThread,
  getActiveThread,
  renameThread,
  resolveThreadWorkingDirectory,
  setThreadWorkingDirectory,
  threadMessageCount,
  tryRestoreLegacyChatStore,
} from "@/lib/chat-store";
import { pushAppMessage } from "@/lib/app-messages";
import { importChatStoreMergeViaApi } from "@/lib/chat-store-api.client";
import { getChatStorePersistenceMode } from "@/lib/chat-store-backend";
import { fetchLegacyChatStoreCandidatesFromDisk } from "@/lib/legacy-chat-restore-client";
import type { DefaultWorkingDirectoryProfile } from "@/lib/default-working-directory";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import {
  formatThreadRelativeTime,
  groupThreadsByCwd,
  readCollapsedCwdGroups,
  SIDEBAR_THREADS_VISIBLE_PER_GROUP,
  writeCollapsedCwdGroups,
} from "@/lib/thread-cwd-groups";
import {
  groupThreadsByActionDesigner,
  type ActionDesignerThreadGroup,
} from "@/lib/action-designer-thread";
import { ExplorerFolderIcon } from "@/components/workspace/ExplorerTreeIcons";

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
  /** Debug designer embed: group by actionDesigner tag instead of cwd. */
  groupBy?: "cwd" | "actionDesigner";
};

type SidebarThreadGroup = {
  key: string;
  label: string;
  title: string;
  threads: ChatStoreData["threads"];
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

function IconChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      className={expanded ? "ws-chevron ws-chevron--open" : "ws-chevron"}
    >
      <path
        d="M3 2l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
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

const DELETE_CONFIRM_MS = 1000;

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

type ThreadDeleteRowActionProps = {
  threadId: string;
  confirming: boolean;
  disabled?: boolean;
  onRequestDelete: (threadId: string) => void;
  onConfirmDelete: (threadId: string) => void;
};

function ThreadDeleteRowAction({
  threadId,
  confirming,
  disabled,
  onRequestDelete,
  onConfirmDelete,
}: ThreadDeleteRowActionProps) {
  if (confirming) {
    return (
      <button
        type="button"
        className="ws-row-confirm-btn"
        onClick={(e) => {
          e.stopPropagation();
          onConfirmDelete(threadId);
        }}
        disabled={disabled}
        title="确认删除"
        aria-label="确认删除对话"
      >
        确认
      </button>
    );
  }

  return (
    <RowAction
      label="删除对话"
      onClick={() => onRequestDelete(threadId)}
      disabled={disabled}
    >
      <IconTrash />
    </RowAction>
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
  groupBy = "cwd",
}: ChatSidebarProps) {
  const activeThread = useMemo(() => getActiveThread(store), [store]);
  const cwdFallbackLabel = !defaultCwdReady
    ? "…"
    : defaultCwd
      ? defaultCwdFallbackLabel(defaultCwdProfile)
      : "未设置";

  const threadGroups = useMemo((): SidebarThreadGroup[] => {
    if (groupBy === "actionDesigner") {
      return groupThreadsByActionDesigner(store.threads).map(
        (group: ActionDesignerThreadGroup) => ({
          key: group.key,
          label: group.label,
          title: group.ref.entityId,
          threads: group.threads,
        }),
      );
    }
    return groupThreadsByCwd(store.threads, cwdFallbackLabel).map((group) => ({
      key: group.key,
      label: group.label,
      title:
        group.path.trim()
        || resolveThreadWorkingDirectory(group.threads[0]!, store, defaultCwd),
      threads: group.threads,
    }));
  }, [groupBy, store, defaultCwd, cwdFallbackLabel]);

  const activeThreadCwd = activeThread.workingDirectory?.trim() ?? "";
  const resolvedActiveCwd = resolveThreadWorkingDirectory(
    activeThread,
    store,
    defaultCwd,
  );

  const [cwdDialogOpen, setCwdDialogOpen] = useState(false);
  const [restoringLegacy, setRestoringLegacy] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() =>
    readCollapsedCwdGroups(),
  );
  const [expandedThreadLists, setExpandedThreadLists] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingDeleteThreadId, setPendingDeleteThreadId] = useState<
    string | null
  >(null);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renamingThreadIdRef = useRef<string | null>(null);
  renamingThreadIdRef.current = renamingThreadId;

  useEffect(() => {
    if (!pendingDeleteThreadId) return;
    const timer = window.setTimeout(() => {
      setPendingDeleteThreadId(null);
    }, DELETE_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [pendingDeleteThreadId]);

  useEffect(() => {
    if (!renamingThreadId) return;
    const input = renameInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [renamingThreadId]);

  const commit = useCallback(
    (next: ChatStoreData) => {
      onChange(next);
    },
    [onChange],
  );

  const toggleGroupCollapsed = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      writeCollapsedCwdGroups(next);
      return next;
    });
  }, []);

  const toggleThreadListExpanded = useCallback((groupKey: string) => {
    setExpandedThreadLists((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const handleNewThread = () => {
    commit(addThread(store));
  };

  const cancelRename = useCallback(() => {
    setRenamingThreadId(null);
    setRenameDraft("");
  }, []);

  const commitRename = useCallback(
    (options?: { threadId?: string; title?: string; clear?: boolean }) => {
      const threadId = options?.threadId ?? renamingThreadId;
      if (!threadId) return;
      const trimmed = (options?.title ?? renameDraft).trim();
      if (trimmed) {
        commit(renameThread(store, threadId, trimmed));
      }
      if (options?.clear !== false) {
        setRenamingThreadId(null);
        setRenameDraft("");
      }
    },
    [commit, renameDraft, renamingThreadId, store],
  );

  const handleStartRenameThread = useCallback(
    (threadId: string, currentTitle: string) => {
      setPendingDeleteThreadId(null);
      if (renamingThreadId && renamingThreadId !== threadId) {
        commitRename({ threadId: renamingThreadId, clear: false });
      }
      setRenamingThreadId(threadId);
      setRenameDraft(currentTitle);
    },
    [commitRename, renamingThreadId],
  );

  const handleRequestDeleteThread = useCallback((threadId: string) => {
    setRenamingThreadId(null);
    setRenameDraft("");
    setPendingDeleteThreadId(threadId);
  }, []);

  const handleConfirmDeleteThread = useCallback(
    (threadId: string) => {
      setPendingDeleteThreadId(null);
      commit(deleteThread(store, threadId));
    },
    [commit, store],
  );

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
          let restored = next;
          if (getChatStorePersistenceMode() === "api") {
            const persisted = await importChatStoreMergeViaApi(next);
            if (persisted) {
              restored = persisted;
            }
          }
          commit(restored);
          const firstImported = restored.threads.find((t) => t.messages.length > 0);
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
        <div className="ws-section ws-section--grow ws-section--rail-primary">
          <div className="ws-section-head ws-section-head--titlebar">
            <button
              type="button"
              className="ws-new-chat-btn"
              onClick={handleNewThread}
              disabled={disabled}
              title="新建对话"
            >
              <IconPlus />
              <span>新对话</span>
            </button>
            <TitlebarDragRegion className="ws-section-head-drag" />
          </div>

          <div className="ws-projects-label">
            {groupBy === "actionDesigner" ? "设计器" : "项目"}
          </div>

          <div
            className="ws-list ws-list--scroll ws-project-tree"
            role="tree"
            aria-label={
              groupBy === "actionDesigner"
                ? "按 ActionDesigner 分组的对话"
                : "按工作目录分组的对话"
            }
          >
            {threadGroups.length === 0 && groupBy === "actionDesigner" ? (
              <p className="ws-designer-debug-empty">
                暂无设计器对话。在 Quicker 动作设计器中打开 AI 标签页后会出现在这里。
              </p>
            ) : null}
            {threadGroups.map((group) => {
              const collapsed = collapsedGroups.has(group.key);
              const listExpanded = expandedThreadLists.has(group.key);
              const visibleThreads = listExpanded
                ? group.threads
                : group.threads.slice(0, SIDEBAR_THREADS_VISIBLE_PER_GROUP);
              const hiddenCount = group.threads.length - visibleThreads.length;

              return (
                <div key={group.key} className="ws-cwd-group" role="treeitem" aria-expanded={!collapsed}>
                  <button
                    type="button"
                    className="ws-cwd-group-head"
                    onClick={() => toggleGroupCollapsed(group.key)}
                    disabled={disabled}
                    title={group.title}
                  >
                    <IconChevron expanded={!collapsed} />
                    <span className="ws-folder-icon" aria-hidden>
                      <ExplorerFolderIcon expanded={!collapsed} />
                    </span>
                    <span className="ws-cwd-group-label">{group.label}</span>
                  </button>

                  {!collapsed ? (
                    <ul className="ws-list ws-thread-group-list" role="group">
                      {visibleThreads.map((thread) => {
                        const selected = thread.id === store.activeThreadId;
                        const renaming = renamingThreadId === thread.id;
                        return (
                          <li
                            key={thread.id}
                            className={`ws-row ws-thread-row${selected ? " ws-row--active" : ""}${pendingDeleteThreadId === thread.id ? " ws-row--delete-pending" : ""}${renaming ? " ws-row--renaming" : ""}`}
                          >
                            {renaming ? (
                              <div className="ws-thread-rename">
                                <input
                                  ref={renameInputRef}
                                  type="text"
                                  className="ws-thread-rename-input"
                                  value={renameDraft}
                                  disabled={disabled}
                                  aria-label="对话标题"
                                  onChange={(event) => {
                                    setRenameDraft(event.target.value);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      commitRename({
                                        threadId: thread.id,
                                        title: renameDraft,
                                      });
                                    } else if (event.key === "Escape") {
                                      event.preventDefault();
                                      cancelRename();
                                    }
                                  }}
                                  onBlur={() => {
                                    const savingThreadId = thread.id;
                                    const title = renameDraft;
                                    window.setTimeout(() => {
                                      if (renamingThreadIdRef.current !== savingThreadId) {
                                        return;
                                      }
                                      commitRename({
                                        threadId: savingThreadId,
                                        title,
                                      });
                                    }, 0);
                                  }}
                                />
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={`ws-item ws-thread-item${selected ? " ws-item--active" : ""}`}
                                onClick={() => onActivateThread(thread.id)}
                                disabled={disabled}
                                aria-selected={selected}
                              >
                                <span className="ws-item-label">{thread.title}</span>
                                <span className="ws-thread-time" suppressHydrationWarning>
                                  {formatThreadRelativeTime(thread.updatedAt)}
                                </span>
                              </button>
                            )}
                            <div className="ws-row-actions">
                              <RowAction
                                label="重命名对话"
                                onClick={() =>
                                  handleStartRenameThread(thread.id, thread.title)}
                                disabled={disabled || renaming}
                              >
                                <IconPencil />
                              </RowAction>
                              <ThreadDeleteRowAction
                                threadId={thread.id}
                                confirming={pendingDeleteThreadId === thread.id}
                                disabled={disabled}
                                onRequestDelete={handleRequestDeleteThread}
                                onConfirmDelete={handleConfirmDeleteThread}
                              />
                            </div>
                          </li>
                        );
                      })}
                      {hiddenCount > 0 ? (
                        <li className="ws-show-more-row">
                          <button
                            type="button"
                            className="ws-show-more-btn"
                            onClick={() => toggleThreadListExpanded(group.key)}
                            disabled={disabled}
                          >
                            展开显示 ({hiddenCount})
                          </button>
                        </li>
                      ) : listExpanded && group.threads.length > SIDEBAR_THREADS_VISIBLE_PER_GROUP ? (
                        <li className="ws-show-more-row">
                          <button
                            type="button"
                            className="ws-show-more-btn"
                            onClick={() => toggleThreadListExpanded(group.key)}
                            disabled={disabled}
                          >
                            收起
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>

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
          {groupBy === "cwd" ? (
          <button
            type="button"
            className="ws-footer-path"
            onClick={() => setCwdDialogOpen(true)}
            disabled={disabled}
            title={resolvedActiveCwd || "点击设置当前对话的工作目录"}
            aria-haspopup="dialog"
          >
            <span className="ws-footer-path-label">工作目录</span>
            <span className="ws-footer-path-value">
              {shortPath(activeThreadCwd, cwdFallbackLabel)}
            </span>
          </button>
          ) : null}
        </div>
      </div>

      <WorkingDirectoryDialog
        open={cwdDialogOpen}
        disabled={disabled}
        value={activeThreadCwd}
        defaultCwd={defaultCwd}
        defaultCwdProfile={defaultCwdProfile}
        onClose={() => setCwdDialogOpen(false)}
        onSave={(path) => {
          commit(setThreadWorkingDirectory(store, activeThread.id, path));
          setCwdDialogOpen(false);
        }}
      />
    </aside>
  );
}
