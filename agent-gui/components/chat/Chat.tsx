"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PinnedAction } from "@/lib/action-context";
import {
  canSendComposedMessage,
  parseUserMessageSegments,
} from "@/lib/compose-user-message";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  defaultEnabledToolIds,
  getToolMeta,
  loadStoredEnabledTools,
} from "@/lib/tool-registry";
import {
  applySidebarCollapsed,
  loadSidebarCollapsed,
} from "@/lib/sidebar-prefs";
import {
  getActiveThread,
  getOpenTabThreads,
  openThread,
  threadMessagesEqual,
  updateThreadMessages,
  updateThreadTitle,
} from "@/lib/chat-store";
import { AppSettingsPanel } from "@/components/chat/AppSettingsPanel";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatTitlebar } from "@/components/chat/ChatTitlebar";
import { SidebarToggle } from "@/components/chat/SidebarToggle";
import { DocsViewerProvider } from "@/lib/docs-viewer";
import {
  WorkspaceExplorerPanelProvider,
  WorkspaceExplorerShellProvider,
} from "@/lib/workspace-explorer";
import { WorkspaceExplorerPanel } from "@/components/workspace/WorkspaceExplorerPanel";
import { useChatStore } from "@/lib/use-chat-store";
import { ContextUsage } from "./ContextUsage";
import {
  ComposerMarkupField,
  type ComposerMarkupFieldHandle,
} from "./ComposerMarkupField";
import { MessageParts } from "./MessageParts";
import { ActionTagSelector } from "./ActionTagSelector";
import { ToolSelector } from "./ToolSelector";
import {
  fetchLlmOptions,
  hasConfiguredLlmProvider,
  ModelSelector,
  pickInitialLlmProvider,
} from "./ModelSelector";
import type { LlmProviderId } from "@/lib/llm-providers";
import { LLM_PROVIDER_ID } from "@/lib/llm-providers";
import { loadStoredLlmProvider, storeLlmProvider } from "@/lib/llm-prefs";
import { LLM_KEYS_UPDATED_EVENT } from "@/lib/llm-settings-events";
import { resolveAgentActivity, isPlaceholderAssistantMessage } from "@/lib/agent-activity";
import { AgentActivityLine } from "@/components/chat/AgentActivityLine";
import { EmptyChatPrompts } from "@/components/chat/EmptyChatPrompts";
import { useMessagesStickScroll } from "@/lib/use-messages-stick-scroll";
import { useUserMessageStickyMarkers } from "@/lib/use-user-message-sticky";
import { useAutoThreadTitle } from "@/lib/use-auto-thread-title";
import { useComposerMessageQueue } from "@/lib/use-composer-message-queue";
import type { AppMainView } from "@/lib/app-main-view";
import { useQkrpcPing, type PingState } from "@/lib/use-qkrpc-ping";
import {
  canEditUserMessage,
  clearUserMessageDraftsFromIndex,
  confirmBranchUserMessageEdit,
  countMessagesRemovedOnBranch,
  findMessageIndex,
  getUserMessageDisplayText,
  hasNonCollapsedTextSelection,
  pruneUserMessageDrafts,
  resolveUserMessageDisplayText,
  upsertUserMessageDraft,
  userMessageHasLocalDraft,
} from "@/lib/user-message-edit";

function formatChatError(error: Error): string {
  const message = error.message?.trim();
  if (!message) {
    return "对话请求失败（无详细错误信息）。可打开开发者工具 Network 查看 /api/chat 响应。";
  }

  if (/^\s*<!DOCTYPE\s+html/i.test(message) || /<html[\s>]/i.test(message)) {
    const titleMatch = message.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim();
    return title
      ? `对话请求失败：/api/chat 返回了 HTML 页面（${title}），不是正常的 JSON/流式响应。请在 Network 里查看该请求的状态码，并看运行 agent-gui 的终端是否有报错。`
      : "对话请求失败：/api/chat 返回了 HTML 页面而非 JSON。请确认 agent-gui 已正确启动，并在 Network 中查看 /api/chat 的状态码与响应。";
  }

  try {
    const parsed = JSON.parse(message) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    /* plain text from /api/chat */
  }

  if (message.length > 500) {
    return `${message.slice(0, 480)}…（响应过长，完整内容见 Network → /api/chat）`;
  }
  return message;
}

type PendingToolApproval = {
  id: string;
  toolName: string;
  label: string;
  input: unknown;
  destructive: boolean;
};

function summarizeApprovalTarget(toolName: string, input: unknown): string {
  if (typeof input !== "object" || input === null) return "即将执行此操作";

  const o = input as Record<string, unknown>;
  if (typeof o.id === "string") {
    if (toolName === "qkrpc_action_delete") return `动作 ${o.id}`;
    if (toolName === "qkrpc_subprogram_delete") return `子程序 ${o.id}`;
    return o.id;
  }
  if (typeof o.title === "string") return o.title;
  if (typeof o.query === "string") return o.query;
  return "即将执行此操作";
}

function collectPendingApprovals(
  messages: AgentUIMessage[],
): PendingToolApproval[] {
  const pending: PendingToolApproval[] = [];

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (
        !isToolOrDynamicToolUIPart(part)
        || part.state !== "approval-requested"
        || !("approval" in part)
        || !part.approval?.id
      ) {
        continue;
      }

      const toolName = getToolOrDynamicToolName(part);
      const meta = getToolMeta(toolName);
      pending.push({
        id: part.approval.id,
        toolName,
        label: meta?.label ?? toolName.replace(/^qkrpc_/, "").replace(/_/g, " "),
        input: "input" in part ? part.input : undefined,
        destructive: meta?.group === "destructive",
      });
    }
  }

  return pending;
}

function ApprovalDock({
  approvals,
  disabled,
  onApproveAll,
  onDenyAll,
}: {
  approvals: PendingToolApproval[];
  disabled: boolean;
  onApproveAll: () => void;
  onDenyAll: () => void;
}) {
  const destructive = approvals.some((approval) => approval.destructive);
  const labels = [...new Set(approvals.map((approval) => approval.label))];
  const title =
    labels.length === 1
      ? `${labels[0]} ${approvals.length} 个待确认`
      : `${approvals.length} 个操作待确认`;
  const targets = approvals
    .slice(0, 3)
    .map((approval) => summarizeApprovalTarget(approval.toolName, approval.input));
  const targetText =
    targets.length === 0
      ? "请确认是否继续。"
      : `${targets.join("、")}${approvals.length > targets.length ? ` 等 ${approvals.length} 项` : ""}`;

  return (
    <div
      className={`approval-hint${destructive ? " approval-hint--destructive" : ""}`}
      role="group"
      aria-label={title}
    >
      <div className="approval-hint-main">
        <div className="approval-hint-title">
          {destructive ? "危险操作" : "需要确认"}：{title}
        </div>
        <div className="approval-hint-summary">{targetText}</div>
      </div>
      <div className="approval-hint-actions">
        <button
          type="button"
          className={`approval-hint-btn approval-hint-btn--approve${destructive ? " approval-hint-btn--danger" : ""}`}
          disabled={disabled}
          onClick={onApproveAll}
        >
          {approvals.length > 1 ? "全部确认" : destructive ? "确认删除" : "确认执行"}
        </button>
        <button
          type="button"
          className="approval-hint-btn approval-hint-btn--deny"
          disabled={disabled}
          onClick={onDenyAll}
        >
          全部取消
        </button>
      </div>
    </div>
  );
}

type ChatPanelProps = {
  threadId: string;
  initialMessages: AgentUIMessage[];
  workingDirectory: string;
  visible?: boolean;
  threadTitle: string;
  titleGenerated: boolean;
  titleManual: boolean;
  ping: PingState;
  connectTick: number;
  onOpenSettings: (targetProviderId?: LlmProviderId) => void;
  onPersist: (threadId: string, messages: AgentUIMessage[]) => void;
  onAutoTitle: (threadId: string, title: string) => void;
};

function ChatPanel({
  threadId,
  initialMessages,
  workingDirectory,
  visible = true,
  threadTitle,
  titleGenerated,
  titleManual,
  ping,
  connectTick,
  onOpenSettings,
  onPersist,
  onAutoTitle,
}: ChatPanelProps) {
  const [draftMessage, setDraftMessage] = useState("");
  const [editAnchorMessageId, setEditAnchorMessageId] = useState<string | null>(
    null,
  );
  const [userMessageDrafts, setUserMessageDrafts] = useState<
    Record<string, string>
  >({});
  const [enabledTools, setEnabledTools] = useState(defaultEnabledToolIds);
  const [llmProvider, setLlmProvider] = useState<LlmProviderId>(LLM_PROVIDER_ID);

  useEffect(() => {
    setEnabledTools(loadStoredEnabledTools());
  }, []);

  const syncLlmProviderFromApi = useCallback(async () => {
    const data = await fetchLlmOptions();
    if (!data) return;
    const initial = pickInitialLlmProvider(data, loadStoredLlmProvider());
    setLlmProvider(initial);
    storeLlmProvider(initial);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await syncLlmProviderFromApi();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [syncLlmProviderFromApi]);

  useEffect(() => {
    const onKeysUpdated = () => {
      void syncLlmProviderFromApi();
    };
    window.addEventListener(LLM_KEYS_UPDATED_EVENT, onKeysUpdated);
    return () => window.removeEventListener(LLM_KEYS_UPDATED_EVENT, onKeysUpdated);
  }, [syncLlmProviderFromApi]);
  const messagesRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerMarkupFieldHandle>(null);
  const persistRef = useRef(onPersist);
  persistRef.current = onPersist;
  const lastPersistedRef = useRef<{
    threadId: string;
    messages: AgentUIMessage[];
  } | null>(null);

  const enabledToolsRef = useRef(enabledTools);
  enabledToolsRef.current = enabledTools;
  const llmProviderRef = useRef(llmProvider);
  llmProviderRef.current = llmProvider;
  const workingDirectoryRef = useRef(workingDirectory);
  workingDirectoryRef.current = workingDirectory;

  // useChat only recreates Chat when `id` changes; body must stay stable and
  // read latest composer settings via refs on each request.
  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          enabledTools: enabledToolsRef.current,
          llmProvider: llmProviderRef.current,
          workingDirectory: workingDirectoryRef.current.trim() || undefined,
        }),
      }),
    [],
  );

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
    clearError,
    addToolApprovalResponse,
  } = useChat<AgentUIMessage>({
      id: threadId,
      messages: initialMessages,
      transport: chatTransport,
      experimental_throttle: 100,
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const prev = lastPersistedRef.current;
      if (
        prev?.threadId === threadId
        && threadMessagesEqual(prev.messages, messages)
      ) {
        return;
      }
      lastPersistedRef.current = { threadId, messages };
      persistRef.current(threadId, messages);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [threadId, messages]);

  useAutoThreadTitle({
    threadId,
    messages,
    status,
    llmProvider,
    currentTitle: threadTitle,
    titleGenerated,
    titleManual,
    onTitle: onAutoTitle,
  });

  const pendingApprovals = useMemo(
    () => collectPendingApprovals(messages),
    [messages],
  );
  const pendingApprovalCount = pendingApprovals.length;

  const busy = status === "submitted" || status === "streaming";
  const { queueLength, enqueueOrSend, clearQueue } = useComposerMessageQueue(
    busy,
    sendMessage,
  );
  const qkrpcOk = ping.status === "ok";
  const composerLocked = !qkrpcOk;

  const { pinToBottom } = useMessagesStickScroll(messagesRef, {
    visible,
    threadId,
    revision: [messages, error, status],
    busy,
  });

  useUserMessageStickyMarkers(messagesRef, visible, messages);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container || !visible) return;

    const onWheel = (event: WheelEvent) => {
      if (event.deltaX === 0) return;

      const target = event.target;
      if (target instanceof Element) {
        const horizontalScroller = target.closest<HTMLElement>(
          ".md-table-wrap, .md-pre, .action-list-table-wrap, .tool-error",
        );
        if (horizontalScroller) {
          const { scrollLeft, scrollWidth, clientWidth } = horizontalScroller;
          const atStart = scrollLeft <= 0;
          const atEnd = scrollLeft + clientWidth >= scrollWidth - 1;
          const scrollingRight = event.deltaX > 0;
          const scrollingLeft = event.deltaX < 0;
          if ((!atStart && scrollingLeft) || (!atEnd && scrollingRight)) {
            return;
          }
        }
      }

      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
      }
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [visible]);

  const focusComposerAtEnd = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        composerRef.current?.focusAtEnd();
      });
    });
  }, []);

  const insertDraftActionTag = useCallback((action: PinnedAction) => {
    composerRef.current?.insertActionTag(action);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const draftTagIds = useMemo(() => {
    const ids = new Set<string>();
    for (const segment of parseUserMessageSegments(draftMessage)) {
      if (segment.type === "tag") ids.add(segment.action.id);
    }
    return ids;
  }, [draftMessage]);
  const draftTagCount = draftTagIds.size;

  const canSend = canSendComposedMessage(draftMessage);

  const editAnchorIndex = useMemo(
    () =>
      editAnchorMessageId
        ? findMessageIndex(messages, editAnchorMessageId)
        : -1,
    [messages, editAnchorMessageId],
  );

  useEffect(() => {
    setUserMessageDrafts((prev) => pruneUserMessageDrafts(messages, prev));
  }, [messages]);

  useEffect(() => {
    if (editAnchorMessageId && editAnchorIndex < 0) {
      setEditAnchorMessageId(null);
    }
  }, [editAnchorMessageId, editAnchorIndex]);

  const exitMessageEdit = useCallback(() => {
    if (!editAnchorMessageId) return;
    const message = messages.find((m) => m.id === editAnchorMessageId);
    const savedDraft = draftMessage;
    setEditAnchorMessageId(null);
    setDraftMessage("");
    if (!message) return;
    setUserMessageDrafts((prev) =>
      upsertUserMessageDraft(message, savedDraft, prev),
    );
  }, [editAnchorMessageId, draftMessage, messages]);

  const discardMessageEditSession = useCallback(() => {
    setEditAnchorMessageId(null);
    setDraftMessage("");
  }, []);

  useEffect(() => {
    if (!editAnchorMessageId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      discardMessageEditSession();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editAnchorMessageId, discardMessageEditSession]);

  const beginEditFromUserMessage = useCallback(
    (message: AgentUIMessage) => {
      if (
        composerLocked
        || !canEditUserMessage(message, userMessageDrafts)
        || hasNonCollapsedTextSelection()
      ) {
        return;
      }

      if (editAnchorMessageId && editAnchorMessageId !== message.id) {
        const previous = messages.find((m) => m.id === editAnchorMessageId);
        if (previous) {
          setUserMessageDrafts((prev) =>
            upsertUserMessageDraft(previous, draftMessage, prev),
          );
        }
      }

      setEditAnchorMessageId(message.id);
      setDraftMessage(resolveUserMessageDisplayText(message, userMessageDrafts));
      clearError();
      focusComposerAtEnd();
    },
    [
      clearError,
      composerLocked,
      draftMessage,
      editAnchorMessageId,
      messages,
      userMessageDrafts,
      focusComposerAtEnd,
    ],
  );

  const commitBranchMessageEdit = useCallback(() => {
    void (async () => {
    if (!editAnchorMessageId) return;
    const anchorIndex = findMessageIndex(messages, editAnchorMessageId);
    if (anchorIndex < 0) return;

    const text = draftMessage.trim();
    if (!canSendComposedMessage(text)) return;

    const removedCount = countMessagesRemovedOnBranch(messages, anchorIndex);
    if (!(await confirmBranchUserMessageEdit(removedCount))) return;

    setEditAnchorMessageId(null);
    setDraftMessage("");
    setUserMessageDrafts((prev) =>
      clearUserMessageDraftsFromIndex(messages, anchorIndex, prev),
    );
    setMessages(messages.slice(0, anchorIndex));
    pinToBottom();
    enqueueOrSend(text);
    })();
  }, [
    editAnchorMessageId,
    draftMessage,
    enqueueOrSend,
    messages,
    pinToBottom,
    setMessages,
  ]);

  const submitComposer = useCallback(() => {
    if (editAnchorMessageId) {
      commitBranchMessageEdit();
      return;
    }
    const text = draftMessage.trim();
    if (!canSendComposedMessage(text)) return;
    setDraftMessage("");
    pinToBottom();
    enqueueOrSend(text);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [
    draftMessage,
    editAnchorMessageId,
    commitBranchMessageEdit,
    enqueueOrSend,
    pinToBottom,
  ]);

  useEffect(() => {
    if (!editAnchorMessageId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          ".composer-box, .composer-edit-banner, .msg--edit-anchor .msg-content",
        )
      ) {
        return;
      }
      exitMessageEdit();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [editAnchorMessageId, exitMessageEdit]);

  const runQuickPrompt = useCallback(
    (text: string) => {
      if (composerLocked) return;
      pinToBottom();
      enqueueOrSend(text);
    },
    [composerLocked, enqueueOrSend, pinToBottom],
  );

  const respondToAllPendingApprovals = useCallback(
    (approved: boolean) => {
      for (const approval of pendingApprovals) {
        addToolApprovalResponse({
          id: approval.id,
          approved,
          reason: approved ? "用户点击批量确认" : "用户批量取消",
        });
      }
    },
    [addToolApprovalResponse, pendingApprovals],
  );

  const qkrpcLoading = ping.status === "loading";
  const agentActivity = useMemo(
    () =>
      resolveAgentActivity({
        chatStatus: status,
        messages,
        qkrpcOk,
        qkrpcLoading,
        pendingApprovalCount,
      }),
    [status, messages, qkrpcOk, qkrpcLoading, pendingApprovalCount],
  );

  const lastVisibleMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (
        agentActivity
        && i === messages.length - 1
        && isPlaceholderAssistantMessage(message)
      ) {
        continue;
      }
      return message.id;
    }
    return null;
  }, [messages, agentActivity]);
  const isEmptyThread = messages.length === 0 && !error;

  useEffect(() => {
    if (
      !visible
      || !isEmptyThread
      || editAnchorMessageId
      || composerLocked
      || busy
    ) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    visible,
    isEmptyThread,
    editAnchorMessageId,
    composerLocked,
    busy,
    threadId,
  ]);

  return (
    <div
      className={`app-main${isEmptyThread ? " app-main--empty" : ""}${visible ? "" : " app-main--hidden"}`}
      aria-hidden={visible ? undefined : true}
    >
      <div className="messages-view">
      <main
        ref={messagesRef}
        className={`messages${agentActivity ? " messages--agent-busy" : ""}`}
      >
        {messages.map((message, messageIndex) => {
          const lastMessage = messages[messages.length - 1];
          if (
            agentActivity
            && message.id === lastMessage?.id
            && isPlaceholderAssistantMessage(message)
          ) {
            return null;
          }

          const isUser = message.role === "user";
          const isEditAnchor = message.id === editAnchorMessageId;
          const isAfterEditAnchor =
            editAnchorIndex >= 0 && messageIndex > editAnchorIndex;
          const hasLocalDraft = userMessageHasLocalDraft(message, userMessageDrafts);
          const userEditable =
            isUser
            && canEditUserMessage(message, userMessageDrafts)
            && !composerLocked;

          return (
            <article
              key={message.id}
              className={`msg msg--${isUser ? "user" : "assistant"}${message.id === lastVisibleMessageId && !agentActivity ? " msg--last" : ""}${isEditAnchor ? " msg--edit-anchor" : ""}${hasLocalDraft ? " msg--local-draft" : ""}${isAfterEditAnchor ? " msg--branch-cutoff" : ""}`}
            >
              <div
                className={`msg-content${userEditable && !isEditAnchor ? " msg-content--editable" : ""}${isEditAnchor ? " msg-content--edit-active" : ""}`}
                role={userEditable && !isEditAnchor ? "button" : undefined}
                tabIndex={userEditable && !isEditAnchor ? 0 : undefined}
                title={
                  isEditAnchor
                    ? "在下方输入框编辑；Enter 发送并从此处继续"
                    : userEditable
                      ? "点击在下方输入框编辑；失焦保存草稿"
                      : undefined
                }
                onClick={
                  isEditAnchor
                    ? () => focusComposerAtEnd()
                    : userEditable
                      ? () => beginEditFromUserMessage(message)
                      : undefined
                }
                onKeyDown={
                  userEditable && !isEditAnchor
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          beginEditFromUserMessage(message);
                        }
                      }
                    : undefined
                }
              >
                <div className="parts">
                  <MessageParts
                    message={message}
                    userTextOverride={
                      isUser
                        ? isEditAnchor
                          ? draftMessage
                          : resolveUserMessageDisplayText(
                              message,
                              userMessageDrafts,
                            )
                        : undefined
                    }
                    addToolApprovalResponse={addToolApprovalResponse}
                    approvalDisabled={busy}
                  />
                </div>
              </div>
            </article>
          );
        })}
        {agentActivity && (
          <article
            className="msg msg--assistant msg--activity msg--last"
            aria-busy="true"
          >
            <div className="msg-content">
              <AgentActivityLine activity={agentActivity} />
            </div>
          </article>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span>{formatChatError(error)}</span>
            <button
              type="button"
              className="error-banner-dismiss"
              onClick={() => clearError()}
              aria-label="关闭错误提示"
            >
              ×
            </button>
          </div>
        )}
        <div ref={messagesEndRef} className="messages-anchor" aria-hidden />
      </main>
      </div>

      {pendingApprovals.length > 0 && (
        <ApprovalDock
          approvals={pendingApprovals}
          disabled={busy}
          onApproveAll={() => respondToAllPendingApprovals(true)}
          onDenyAll={() => respondToAllPendingApprovals(false)}
        />
      )}

      <footer
        className={`composer${editAnchorMessageId ? " composer--branch-edit" : ""}`}
      >
        {editAnchorMessageId && (
          <div className="composer-edit-banner" role="status">
            <span className="composer-edit-banner-text">
              正在编辑较早的消息；在下方输入框修改，Enter 发送并从此处继续
            </span>
            <button
              type="button"
              className="composer-edit-banner-cancel"
              onClick={exitMessageEdit}
            >
              完成
            </button>
          </div>
        )}
        {isEmptyThread && !editAnchorMessageId && (
          <EmptyChatPrompts
            disabled={composerLocked}
            onRun={runQuickPrompt}
          />
        )}
        <form
          className="composer-form"
          onSubmit={(e) => {
            e.preventDefault();
            submitComposer();
          }}
        >
          <div className="composer-box">
            <div className="composer-surface">
            <ComposerMarkupField
              ref={composerRef}
              value={draftMessage}
              placeholder={
                editAnchorMessageId
                  ? "修改后 Enter 发送，将从此消息处重新对话…（@ 引用动作）"
                  : queueLength > 0
                    ? `Agent 完成后将发送已排队的 ${queueLength} 条消息…`
                    : "描述你想在 Quicker 里做的事…（@ 引用动作）"
              }
              disabled={composerLocked}
              qkrpcOk={qkrpcOk}
              onChange={setDraftMessage}
              onSubmit={submitComposer}
            />
            <div className="composer-toolbar">
              <div className="composer-toolbar-left">
                <ActionTagSelector
                  ping={ping}
                  refreshKey={connectTick}
                  tagCount={draftTagCount}
                  embeddedTagIds={draftTagIds}
                  onSelect={insertDraftActionTag}
                  disabled={composerLocked}
                />
                <ToolSelector
                  enabledTools={enabledTools}
                  onChange={setEnabledTools}
                  disabled={composerLocked}
                />
                <ModelSelector
                  providerId={llmProvider}
                  onChange={(id) => {
                    setLlmProvider(id);
                    storeLlmProvider(id);
                  }}
                  onNeedSettings={onOpenSettings}
                  disabled={composerLocked}
                />
                <span className="composer-hint">
                  {editAnchorMessageId
                    ? "Enter 发送并分支"
                    : queueLength > 0
                      ? `已排队 ${queueLength} 条`
                      : "Shift+Enter 换行"}
                </span>
              </div>
              <div className="composer-toolbar-actions">
                {!isEmptyThread && (
                  <ContextUsage
                    messages={messages}
                    busy={busy}
                    providerId={llmProvider}
                  />
                )}
                {busy && (
                  <button
                    type="button"
                    className="composer-btn composer-btn--stop"
                    onClick={() => {
                      clearQueue();
                      stop();
                    }}
                    aria-label="停止生成"
                    title={queueLength > 0 ? "停止并清空排队" : "停止生成"}
                  >
                    <svg
                      className="composer-stop-icon"
                      width="20"
                      height="20"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <path
                        fill="currentColor"
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M8 1.35a6.65 6.65 0 1 1 0 13.3 6.65 6.65 0 1 1 0-13.3ZM5.75 5.75h4.5v4.5h-4.5V5.75Z"
                      />
                    </svg>
                  </button>
                )}
                <button
                  type="submit"
                  className="composer-btn composer-btn--send"
                  disabled={!canSend || composerLocked}
                  aria-label={busy ? "加入发送队列" : "发送"}
                  title={busy ? "加入发送队列" : "发送"}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M8 3v10M8 3l4 4M8 3L4 7"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
            </div>
          </div>
        </form>
      </footer>
    </div>
  );
}

export function Chat() {
  const { store, defaultCwd, defaultCwdProfile, updateStore } = useChatStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mainView, setMainView] = useState<AppMainView>("chat");
  const [settingsTabOpen, setSettingsTabOpen] = useState(false);
  const [settingsFocusProviderId, setSettingsFocusProviderId] = useState<
    LlmProviderId | undefined
  >(undefined);
  const { ping, refreshPing, connectTick } = useQkrpcPing();
  const storeRef = useRef(store);
  storeRef.current = store;

  useLayoutEffect(() => {
    const collapsed = loadSidebarCollapsed();
    setSidebarCollapsed(collapsed);
    applySidebarCollapsed(collapsed);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      applySidebarCollapsed(next);
      return next;
    });
  }, []);

  const persistMessages = useCallback(
    (threadId: string, messages: AgentUIMessage[]) => {
      updateStore(updateThreadMessages(storeRef.current, threadId, messages));
    },
    [updateStore],
  );

  const handleAutoTitle = useCallback(
    (threadId: string, title: string) => {
      updateStore(updateThreadTitle(storeRef.current, threadId, title));
    },
    [updateStore],
  );

  const handleActivateThread = useCallback(
    (threadId: string) => {
      updateStore(openThread(storeRef.current, threadId));
      setMainView("chat");
    },
    [updateStore],
  );

  const openSettingsTab = useCallback((targetProviderId?: LlmProviderId) => {
    setSettingsFocusProviderId(targetProviderId);
    setSettingsTabOpen(true);
    setMainView("settings");
  }, []);

  const llmSettingsAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (llmSettingsAutoOpenedRef.current) return;
    let cancelled = false;
    void (async () => {
      const data = await fetchLlmOptions();
      if (cancelled || !data || hasConfiguredLlmProvider(data)) return;
      llmSettingsAutoOpenedRef.current = true;
      openSettingsTab();
    })();
    return () => {
      cancelled = true;
    };
  }, [openSettingsTab]);

  const closeSettingsTab = useCallback(() => {
    setSettingsTabOpen(false);
    setMainView("chat");
    setSettingsFocusProviderId(undefined);
  }, []);

  const activeThread = getActiveThread(store);
  const workingDirectory = store.workingDirectory.trim() || defaultCwd;

  return (
    <WorkspaceExplorerShellProvider>
    <div
      className={`app-shell${sidebarCollapsed ? " app-shell--sidebar-collapsed" : ""}`}
      suppressHydrationWarning
    >
        <div className="app-shell-toggle-slot">
          <SidebarToggle
            sidebarOpen={!sidebarCollapsed}
            onClick={toggleSidebar}
            className="shell-sidebar-toggle"
          />
        </div>
        <div className="workspace-rail" aria-hidden={sidebarCollapsed}>
          <ChatSidebar
            store={store}
            defaultCwd={defaultCwd}
            defaultCwdProfile={defaultCwdProfile}
            onChange={updateStore}
            onActivateThread={handleActivateThread}
            onShowChatView={() => setMainView("chat")}
          />
        </div>
        <div className="app-main-column">
          <ChatTitlebar
            store={store}
            mainView={mainView}
            settingsTabOpen={settingsTabOpen}
            onChange={updateStore}
            onMainViewChange={setMainView}
            onOpenSettingsTab={openSettingsTab}
            onCloseSettingsTab={closeSettingsTab}
          />
          <DocsViewerProvider>
            <div className="app-content-row">
              <div className="app-main-shell">
                {mainView === "settings" && settingsTabOpen ? (
                  <AppSettingsPanel
                    active
                    ping={ping}
                    onRefreshPing={refreshPing}
                    focusProviderId={settingsFocusProviderId}
                  />
                ) : (
                  <div className="app-main-stack">
                    {getOpenTabThreads(store).map((thread) => (
                      <ChatPanel
                        key={thread.id}
                        threadId={thread.id}
                        initialMessages={thread.messages}
                        workingDirectory={workingDirectory}
                        visible={thread.id === activeThread.id}
                        threadTitle={thread.title}
                        titleGenerated={thread.titleGenerated ?? false}
                        titleManual={thread.titleManual ?? false}
                        ping={ping}
                        connectTick={connectTick}
                        onOpenSettings={openSettingsTab}
                        onPersist={persistMessages}
                        onAutoTitle={handleAutoTitle}
                      />
                    ))}
                  </div>
                )}
              </div>
              <WorkspaceExplorerPanelProvider cwd={workingDirectory}>
                <WorkspaceExplorerPanel />
              </WorkspaceExplorerPanelProvider>
            </div>
          </DocsViewerProvider>
        </div>
      </div>
    </WorkspaceExplorerShellProvider>
  );
}
