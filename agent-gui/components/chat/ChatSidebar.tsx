"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
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
  tryRestoreLegacyChatStore,
} from "@/lib/chat-store";
import { pushAppMessage } from "@/lib/app-messages";
import { importChatStoreMergeViaApi } from "@/lib/chat-store-api.client";
import { getChatStorePersistenceMode } from "@/lib/chat-store-backend";
import { fetchLegacyChatStoreCandidatesFromDisk } from "@/lib/legacy-chat-restore-client";
import type { DefaultWorkingDirectoryProfile } from "@/lib/default-working-directory";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import {
  defaultCwdGroupLabel,
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
import {
  pinThreadId,
  readPinnedThreadIds,
  resolvePinnedThreads,
  unpinThreadId,
  writePinnedThreadIds,
} from "@/lib/thread-sidebar-pins";
import {
  getThreadRunStatusVersion,
  isThreadRunBusy,
  subscribeThreadRunStatus,
} from "@/lib/thread-run-status";

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

/** Quicker FA Light folder glyphs (qkrpc fa resolve). */
const FA_LIGHT_FOLDER = {
  width: 512,
  height: 512,
  path: "M194.74 96l54.63 54.63c6 6 14.14 9.37 22.63 9.37h192c8.84 0 16 7.16 16 16v224c0 8.84-7.16 16-16 16H48c-8.84 0-16-7.16-16-16V112c0-8.84 7.16-16 16-16h146.74M48 64C21.49 64 0 85.49 0 112v288c0 26.51 21.49 48 48 48h416c26.51 0 48-21.49 48-48V176c0-26.51-21.49-48-48-48H272l-54.63-54.63c-6-6-14.14-9.37-22.63-9.37H48z",
} as const;

const FA_LIGHT_FOLDER_OPEN = {
  width: 576,
  height: 512,
  path: "M527.95 224H480v-48c0-26.51-21.49-48-48-48H272l-64-64H48C21.49 64 0 85.49 0 112v288c0 26.51 21.49 48 48 48h385.057c28.068 0 54.135-14.733 68.599-38.84l67.453-112.464C588.24 264.812 565.285 224 527.95 224zM48 96h146.745l64 64H432c8.837 0 16 7.163 16 16v48H171.177c-28.068 0-54.135 14.733-68.599 38.84L32 380.47V112c0-8.837 7.163-16 16-16zm493.695 184.232l-67.479 112.464A47.997 47.997 0 0 1 433.057 416H44.823l82.017-136.696A48 48 0 0 1 168 256h359.975c12.437 0 20.119 13.568 13.72 24.232z",
} as const;

function SidebarFolderIcon({ expanded }: { expanded: boolean }) {
  const icon = expanded ? FA_LIGHT_FOLDER_OPEN : FA_LIGHT_FOLDER;
  return (
    <span className="ws-sidebar-folder-icon" aria-hidden>
      <svg
        width={16}
        height={16}
        viewBox={`0 0 ${icon.width} ${icon.height}`}
        fill="currentColor"
      >
        <path d={icon.path} />
      </svg>
    </span>
  );
}

function ThreadRunIndicator({ running }: { running: boolean }) {
  return (
    <span
      className={`ws-thread-status${running ? " ws-thread-status--running" : ""}`}
      aria-hidden={!running}
      {...(running ? { "aria-label": "对话进行中" } : {})}
    >
      {running ? (
        <svg
          className="ws-thread-status-spinner"
          viewBox="0 0 16 16"
          width="16"
          height="16"
          aria-hidden
        >
          <circle
            cx="8"
            cy="8"
            r="5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeDasharray="14 10"
          />
        </svg>
      ) : (
        <span className="ws-thread-status-dot" />
      )}
    </span>
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

/** Quicker FA Light thumbtack (qkrpc fa resolve fa:Light_Thumbtack). */
const FA_LIGHT_THUMBTACK = {
  width: 384,
  height: 512,
  path: "M300.8 203.9L290.7 128H328c13.2 0 24-10.8 24-24V24c0-13.2-10.8-24-24-24H56C42.8 0 32 10.8 32 24v80c0 13.2 10.8 24 24 24h37.3l-10.1 75.9C34.9 231.5 0 278.4 0 335.2c0 8.8 7.2 16 16 16h160V472c0 .7.1 1.3.2 1.9l8 32c2 8 13.5 8.1 15.5 0l8-32c.2-.6.2-1.3.2-1.9V351.2h160c8.8 0 16-7.2 16-16 .1-56.8-34.8-103.7-83.1-131.3zM33.3 319.2c6.8-42.9 39.6-76.4 79.5-94.5L128 96H64V32h256v64h-64l15.3 128.8c40 18.2 72.7 51.8 79.5 94.5H33.3z",
} as const;

function IconThumbtack({ active = false }: { active?: boolean }) {
  return (
    <svg
      className={active ? "ws-pin-icon ws-pin-icon--active" : "ws-pin-icon"}
      width={12}
      height={12}
      viewBox={`0 0 ${FA_LIGHT_THUMBTACK.width} ${FA_LIGHT_THUMBTACK.height}`}
      aria-hidden
    >
      <path fill="currentColor" d={FA_LIGHT_THUMBTACK.path} />
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
  disabled?: boolean;
  onRequestDelete: () => void;
};

function ThreadDeleteRowAction({
  disabled,
  onRequestDelete,
}: ThreadDeleteRowActionProps) {
  return (
    <RowAction
      label="删除对话"
      onClick={onRequestDelete}
      disabled={disabled}
    >
      <IconTrash />
    </RowAction>
  );
}

type ThreadSidebarRowProps = {
  thread: ChatStoreData["threads"][number];
  selected: boolean;
  pinned: boolean;
  running: boolean;
  renaming: boolean;
  renameDraft: string;
  pendingDelete: boolean;
  disabled?: boolean;
  renameInputRef?: React.RefObject<HTMLInputElement | null>;
  onActivate: () => void;
  onStartRename: () => void;
  onTogglePin: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onRenameDraftChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
};

function ThreadSidebarRow({
  thread,
  selected,
  pinned,
  running,
  renaming,
  renameDraft,
  pendingDelete,
  disabled,
  renameInputRef,
  onActivate,
  onStartRename,
  onTogglePin,
  onRequestDelete,
  onConfirmDelete,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
}: ThreadSidebarRowProps) {
  return (
    <li
      className={`ws-row ws-thread-row${selected ? " ws-row--active" : ""}${pendingDelete ? " ws-row--delete-pending" : ""}${renaming ? " ws-row--renaming" : ""}`}
    >
      {renaming ? (
        <div className="ws-thread-rename">
          <ThreadRunIndicator running={running} />
          <input
            ref={renameInputRef}
            type="text"
            className="ws-thread-rename-input"
            value={renameDraft}
            disabled={disabled}
            aria-label="对话标题"
            onChange={(event) => {
              onRenameDraftChange(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onRenameCommit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                onRenameCancel();
              }
            }}
            onBlur={onRenameCommit}
          />
        </div>
      ) : (
        <div
          className={`ws-item ws-thread-item${selected ? " ws-item--active" : ""}`}
        >
          <button
            type="button"
            className="ws-thread-item-main"
            onClick={onActivate}
            onDoubleClick={(event) => {
              event.preventDefault();
              onStartRename();
            }}
            disabled={disabled}
            aria-selected={selected}
          >
            <ThreadRunIndicator running={running} />
            <span className="ws-item-label">{thread.title}</span>
          </button>
          <span
            className={`ws-thread-trail${pendingDelete ? " ws-thread-trail--confirm" : ""}`}
          >
            {pendingDelete ? (
              <button
                type="button"
                className="ws-row-confirm-btn"
                onClick={onConfirmDelete}
                disabled={disabled}
                title="确认删除"
                aria-label="确认删除对话"
              >
                确认
              </button>
            ) : (
              <>
                <span className="ws-thread-time" suppressHydrationWarning>
                  {formatThreadRelativeTime(thread.updatedAt)}
                </span>
                <span className="ws-thread-trail-actions">
                  <RowAction
                    label={pinned ? "取消置顶" : "置顶对话"}
                    onClick={onTogglePin}
                    disabled={disabled}
                  >
                    <IconThumbtack active={pinned} />
                  </RowAction>
                  <ThreadDeleteRowAction
                    disabled={disabled}
                    onRequestDelete={onRequestDelete}
                  />
                </span>
              </>
            )}
          </span>
        </div>
      )}
    </li>
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
      ? defaultCwdGroupLabel(defaultCwd)
      : "未设置";

  const [cwdDialogOpen, setCwdDialogOpen] = useState(false);
  const [restoringLegacy, setRestoringLegacy] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedThreadLists, setExpandedThreadLists] = useState<Set<string>>(
    () => new Set(),
  );
  const [pinnedThreadIds, setPinnedThreadIds] = useState<string[]>(
    () => [],
  );
  const [pendingDeleteThreadId, setPendingDeleteThreadId] = useState<
    string | null
  >(null);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renamingThreadIdRef = useRef<string | null>(null);
  renamingThreadIdRef.current = renamingThreadId;

  const pinnedThreadIdSet = useMemo(
    () => new Set(pinnedThreadIds),
    [pinnedThreadIds],
  );

  const threadGroups = useMemo((): SidebarThreadGroup[] => {
    const sourceThreads = store.threads.filter(
      (thread) => !pinnedThreadIdSet.has(thread.id),
    );
    if (groupBy === "actionDesigner") {
      return groupThreadsByActionDesigner(sourceThreads).map(
        (group: ActionDesignerThreadGroup) => ({
          key: group.key,
          label: group.label,
          title: group.ref.entityId,
          threads: group.threads,
        }),
      );
    }
    return groupThreadsByCwd(sourceThreads, cwdFallbackLabel).map((group) => ({
      key: group.key,
      label: group.label,
      title:
        group.path.trim()
        || resolveThreadWorkingDirectory(group.threads[0]!, store, defaultCwd),
      threads: group.threads,
    }));
  }, [groupBy, store, defaultCwd, cwdFallbackLabel, pinnedThreadIdSet]);

  const pinnedThreads = useMemo(
    () => resolvePinnedThreads(store.threads, pinnedThreadIds),
    [store.threads, pinnedThreadIds],
  );

  const activeThreadCwd = activeThread.workingDirectory?.trim() ?? "";
  const resolvedActiveCwd = resolveThreadWorkingDirectory(
    activeThread,
    store,
    defaultCwd,
  );

  useSyncExternalStore(
    subscribeThreadRunStatus,
    getThreadRunStatusVersion,
    () => 0,
  );

  useEffect(() => {
    setCollapsedGroups(readCollapsedCwdGroups());
    setPinnedThreadIds(readPinnedThreadIds());
  }, []);

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
      const nextPinned = unpinThreadId(pinnedThreadIds, threadId);
      if (nextPinned.length !== pinnedThreadIds.length) {
        setPinnedThreadIds(nextPinned);
        writePinnedThreadIds(nextPinned);
      }
      commit(deleteThread(store, threadId));
    },
    [commit, pinnedThreadIds, store],
  );

  const handleTogglePinThread = useCallback((threadId: string) => {
    setPinnedThreadIds((prev) => {
      const next = prev.includes(threadId)
        ? unpinThreadId(prev, threadId)
        : pinThreadId(prev, threadId);
      writePinnedThreadIds(next);
      return next;
    });
  }, []);

  const renderThreadRow = useCallback(
    (thread: ChatStoreData["threads"][number]) => {
      const selected = thread.id === store.activeThreadId;
      const renaming = renamingThreadId === thread.id;
      const running = isThreadRunBusy(thread.id);
      const pinned = pinnedThreadIdSet.has(thread.id);
      return (
        <ThreadSidebarRow
          key={thread.id}
          thread={thread}
          selected={selected}
          pinned={pinned}
          running={running}
          renaming={renaming}
          renameDraft={renameDraft}
          pendingDelete={pendingDeleteThreadId === thread.id}
          disabled={disabled}
          renameInputRef={renameInputRef}
          onActivate={() => onActivateThread(thread.id)}
          onStartRename={() => handleStartRenameThread(thread.id, thread.title)}
          onTogglePin={() => handleTogglePinThread(thread.id)}
          onRequestDelete={() => handleRequestDeleteThread(thread.id)}
          onConfirmDelete={() => handleConfirmDeleteThread(thread.id)}
          onRenameDraftChange={setRenameDraft}
          onRenameCommit={() => {
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
          onRenameCancel={cancelRename}
        />
      );
    },
    [
      cancelRename,
      commitRename,
      disabled,
      handleConfirmDeleteThread,
      handleRequestDeleteThread,
      handleStartRenameThread,
      handleTogglePinThread,
      onActivateThread,
      pendingDeleteThreadId,
      pinnedThreadIdSet,
      renameDraft,
      renamingThreadId,
      store.activeThreadId,
    ],
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

          {pinnedThreads.length > 0 ? (
            <>
              <div className="ws-projects-label">置顶</div>
              <ul
                className="ws-list ws-pinned-thread-list"
                aria-label="置顶对话"
              >
                {pinnedThreads.map((thread) => renderThreadRow(thread))}
              </ul>
            </>
          ) : null}

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
                    <SidebarFolderIcon expanded={!collapsed} />
                    <span className="ws-cwd-group-label">{group.label}</span>
                  </button>

                  {!collapsed ? (
                    <ul className="ws-list ws-thread-group-list" role="group">
                      {visibleThreads.map((thread) => renderThreadRow(thread))}
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
