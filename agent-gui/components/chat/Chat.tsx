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
  buildApprovalDockCopy,
  extractApprovalTargetId,
  type PendingToolApproval,
} from "@/lib/tool-approval-display";
import {
  findWorkspaceProjectsInTree,
  findWorkspaceSubProgramsInTree,
  type WorkspaceDeleteProjectHit,
} from "@/lib/workspace-action-project-lookup";
import {
  deleteActionProjectApi,
  fetchActionExplorerTree,
} from "@/lib/workspace-explorer-api";
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
import {
  postLauncherSessionSync,
  subscribeLauncherBridge,
} from "@/lib/launcher/launcher-bridge";
import {
  queueLauncherSubmit,
  subscribeLauncherSubmit,
  takeLauncherSubmit,
} from "@/lib/launcher/launcher-submit-queue";
import {
  clearEphemeralLauncherRuns,
  getEphemeralLauncherRuns,
  getLauncherSessionForThread,
  startEphemeralLauncherRun,
  subscribeEphemeralLauncherRuns,
} from "@/lib/launcher/launcher-session";
import { AppSettingsPopup } from "@/components/chat/AppSettingsPopup";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ReleasePreviewBanner } from "@/components/dev/ReleasePreviewBanner";
import { ChatConversationHeader } from "@/components/chat/ChatConversationHeader";
import { WorkspaceSidePanelTabBar } from "@/components/workspace/WorkspaceSidePanelTabBar";
import { dispatchWorkspaceLayoutResize } from "@/lib/embedded-webview-bounds";
import { useAppMainSplit } from "@/lib/use-app-main-split";
import { ChatTitlebar } from "@/components/chat/ChatTitlebar";
import { SidebarToggle } from "@/components/chat/SidebarToggle";
import { DocsViewerProvider } from "@/lib/docs-viewer";
import {
  WorkspaceExplorerPanelProvider,
  WorkspaceExplorerShellProvider,
  useWorkspaceExplorerShell,
} from "@/lib/workspace-explorer";
import { WorkspaceExplorerPanel } from "@/components/workspace/WorkspaceExplorerPanel";
import { AppMainWorkspaceSplit } from "@/components/workspace/AppMainWorkspaceSplit";
import { EmbeddedBrowserProvider } from "@/lib/embedded-browser-context";
import { useBrowserPanelMessageSync } from "@/lib/use-browser-panel-message-sync";
import { WorkspaceMainEditorTabBridgeRegistrar } from "@/components/workspace/WorkspaceMainEditorTabBridgeRegistrar";
import { useChatStore } from "@/lib/use-chat-store";
import { ContextUsage } from "./ContextUsage";
import {
  ComposerMarkupField,
  type ComposerMarkupFieldHandle,
} from "./ComposerMarkupField";
import { ComposerPrimaryActionButton } from "./ComposerPrimaryActionButton";
import { LastMessageMoreMenu } from "./LastMessageMoreMenu";
import { MessageParts } from "./MessageParts";
import { TurnActionLinkCard } from "./TurnActionLinkCard";
import { ActionTagSelector } from "./ActionTagSelector";
import { ToolSelector } from "./ToolSelector";
import { ChatModeSelector } from "./ChatModeSelector";
import {
  fetchLlmOptions,
  hasConfiguredLlmOption,
  ModelSelector,
  pickInitialLauncherLlmSelectionFromApi,
  pickInitialLlmSelectionFromApi,
} from "./ModelSelector";
import { formatLlmSelection } from "@/lib/llm-selection";
import { LLM_PROVIDER_ID, type LlmProviderId } from "@/lib/llm-providers";
import type { AppSettingsTabId } from "@/lib/app-settings-tabs";
import {
  loadLauncherLlmSelectionRaw,
  storeLauncherLlmSelectionRaw,
} from "@/lib/launcher/launcher-llm-prefs";
import {
  loadStoredLlmSelectionRaw,
  storeLlmSelectionRaw,
} from "@/lib/llm-prefs";
import { LLM_KEYS_UPDATED_EVENT } from "@/lib/llm-settings-events";
import { resolveAgentActivity, isPlaceholderAssistantMessage } from "@/lib/agent-activity";
import { AgentActivityLine } from "@/components/chat/AgentActivityLine";
import { ComposerShortcutCards } from "@/components/chat/ComposerShortcutCards";
import { useMessagesStickScroll } from "@/lib/use-messages-stick-scroll";
import { useChatMessageWindow } from "@/lib/use-chat-message-window";
import { findUserTurnStartIndices } from "@/lib/last-user-turn-index";
import { useForwardWheelToMessages } from "@/lib/use-forward-wheel-to-messages";
import { useMessagesScrollportHeight } from "@/lib/use-messages-scrollport-height";
import { useMsgTurnStickyActive } from "@/lib/use-msg-turn-sticky-active";
import { UserMessageComposerChrome } from "./UserMessageComposerChrome";
import { useThreadTitleFromTool } from "@/lib/use-thread-title-from-tool";
import { useComposerMessageQueue } from "@/lib/use-composer-message-queue";
import { useVoiceInput } from "@/lib/voice-input/use-voice-input";
import { useComposerVoiceToggleShortcut } from "@/lib/voice-input/use-composer-voice-shortcut";
import { requestVoicePluginSetup } from "@/lib/voice-input/voice-plugin-install-flow";
import { useLauncherGlobalShortcut } from "@/lib/launcher/use-launcher-global-shortcut";
import { ComposerTestPromptsPicker } from "@/components/chat/ComposerTestPromptsPicker";
import { useDevExperienceEnabled } from "@/lib/release-preview.client";
import {
  CHAT_MODE_AGENT,
  CHAT_MODE_LAUNCHER,
  resolveEnabledToolsForChatMode,
  type ChatMode,
} from "@/lib/chat-mode";
import {
  loadStoredChatMode,
  storeChatMode,
} from "@/lib/chat-mode-prefs";
import { useActionProjectImportFromMessages } from "@/lib/action-project-import-from-messages";
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
import { repairInterruptedToolCalls } from "@/lib/repair-interrupted-tool-calls";

/** Debounced persist after messages settle. */
const CHAT_PERSIST_DEBOUNCE_MS = 400;
/** Cap data loss during long streaming/tool runs when debounce keeps resetting. */
const CHAT_PERSIST_MAX_INTERVAL_MS = 5000;

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
  workspaceHits,
  deleteWorkspaceToo,
  onDeleteWorkspaceTooChange,
  onApproveAll,
  onDenyAll,
}: {
  approvals: PendingToolApproval[];
  disabled: boolean;
  workspaceHits: WorkspaceDeleteProjectHit[];
  deleteWorkspaceToo: boolean;
  onDeleteWorkspaceTooChange: (value: boolean) => void;
  onApproveAll: (options: { deleteWorkspace: boolean }) => void;
  onDenyAll: () => void;
}) {
  const actionWorkspaceHits = workspaceHits.filter((h) => h.kind === "action");
  const subprogramWorkspaceHits = workspaceHits.filter(
    (h) => h.kind === "subprogram",
  );
  const copy = buildApprovalDockCopy(approvals, {
    workspaceActionProjectCount: actionWorkspaceHits.length,
    workspaceSubProgramProjectCount: subprogramWorkspaceHits.length,
  });

  return (
    <div
      className={`approval-hint${copy.destructive ? " approval-hint--destructive" : ""}`}
      role="group"
      aria-label={copy.title}
    >
      <div className="approval-hint-main">
        <div className="approval-hint-title">{copy.title}</div>
        <div className="approval-hint-summary">{copy.summary}</div>
        {copy.shellCommands && copy.shellCommands.length > 0 ? (
          <div className="approval-hint-shell-commands" aria-label="待执行的终端命令">
            {copy.shellCommands.map((command, index) => (
              <pre
                key={`${index}-${command.slice(0, 24)}`}
                className="approval-hint-shell-command"
              >
                {command}
              </pre>
            ))}
          </div>
        ) : null}
        {copy.workspaceDelete ? (
          <label className="approval-hint-workspace">
            <input
              type="checkbox"
              checked={deleteWorkspaceToo}
              disabled={disabled}
              onChange={(event) => onDeleteWorkspaceTooChange(event.target.checked)}
            />
            <span className="approval-hint-workspace-text">
              {copy.workspaceDelete.checkboxLabel}
            </span>
            {copy.workspaceDelete.detail ? (
              <span className="approval-hint-workspace-detail">
                {copy.workspaceDelete.detail}
              </span>
            ) : null}
          </label>
        ) : null}
      </div>
      <div className="approval-hint-actions">
        <button
          type="button"
          className={`approval-hint-btn approval-hint-btn--approve${copy.destructive ? " approval-hint-btn--danger" : ""}`}
          disabled={disabled}
          onClick={() =>
            onApproveAll({
              deleteWorkspace: deleteWorkspaceToo && workspaceHits.length > 0,
            })}
        >
          {copy.approveLabel}
        </button>
        <button
          type="button"
          className="approval-hint-btn approval-hint-btn--deny"
          disabled={disabled}
          onClick={onDenyAll}
        >
          {copy.denyLabel}
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
  ephemeral?: boolean;
  threadTitle: string;
  titleGenerated: boolean;
  titleManual: boolean;
  ping: PingState;
  connectTick: number;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onOpenSettings: (targetProviderId?: LlmProviderId, tab?: AppSettingsTabId) => void;
  onPersist: (threadId: string, messages: AgentUIMessage[]) => void;
  onAutoTitle: (threadId: string, title: string) => void;
};

function ChatPanel({
  threadId,
  initialMessages,
  workingDirectory,
  visible = true,
  ephemeral = false,
  threadTitle,
  titleGenerated,
  titleManual,
  ping,
  connectTick,
  settingsOpen,
  onToggleSettings,
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
  const [chatMode, setChatMode] = useState<ChatMode>(() =>
    ephemeral ? CHAT_MODE_LAUNCHER : loadStoredChatMode(),
  );
  const [llmSelection, setLlmSelection] = useState(
    formatLlmSelection({ kind: "builtin", providerId: LLM_PROVIDER_ID }),
  );
  const devExperienceEnabled = useDevExperienceEnabled();
  const { panelOpen } = useWorkspaceExplorerShell();
  const appMainBodyRef = useRef<HTMLDivElement>(null);
  const splitStyle = useAppMainSplit(appMainBodyRef, panelOpen);

  useEffect(() => {
    setEnabledTools(loadStoredEnabledTools());
    if (!ephemeral) {
      setChatMode(loadStoredChatMode());
    }
  }, [ephemeral]);

  const syncLlmSelectionFromApi = useCallback(async () => {
    const data = await fetchLlmOptions();
    if (!data) return;
    const initial = ephemeral
      ? pickInitialLauncherLlmSelectionFromApi(
          data,
          loadLauncherLlmSelectionRaw(),
        )
      : pickInitialLlmSelectionFromApi(data, loadStoredLlmSelectionRaw());
    setLlmSelection((prev) => {
      if (prev === initial) return prev;
      if (ephemeral) {
        storeLauncherLlmSelectionRaw(initial);
      } else {
        storeLlmSelectionRaw(initial);
      }
      return initial;
    });
  }, [ephemeral]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await syncLlmSelectionFromApi();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [syncLlmSelectionFromApi]);

  useEffect(() => {
    const onKeysUpdated = () => {
      void syncLlmSelectionFromApi();
    };
    window.addEventListener(LLM_KEYS_UPDATED_EVENT, onKeysUpdated);
    return () => window.removeEventListener(LLM_KEYS_UPDATED_EVENT, onKeysUpdated);
  }, [syncLlmSelectionFromApi]);

  const appMainRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLElement>(null);
  const msgTurnRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerMarkupFieldHandle>(null);
  const voiceInterruptRef = useRef<() => void>(() => {});
  const persistRef = useRef(onPersist);
  persistRef.current = onPersist;
  const lastPersistedRef = useRef<{
    threadId: string;
    messages: AgentUIMessage[];
  } | null>(null);

  const enabledToolsRef = useRef(enabledTools);
  enabledToolsRef.current = enabledTools;
  const chatModeRef = useRef(chatMode);
  chatModeRef.current = chatMode;
  const llmSelectionRef = useRef(llmSelection);
  llmSelectionRef.current = llmSelection;
  const workingDirectoryRef = useRef(workingDirectory);
  workingDirectoryRef.current = workingDirectory;
  const titleManualRef = useRef(titleManual);
  titleManualRef.current = titleManual;

  // useChat only recreates Chat when `id` changes; body must stay stable and
  // read latest composer settings via refs on each request.
  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          chatMode: chatModeRef.current,
          enabledTools: resolveEnabledToolsForChatMode(
            chatModeRef.current,
            enabledToolsRef.current,
            loadStoredEnabledTools,
          ),
          llmSelection: llmSelectionRef.current,
          llmProvider: llmSelectionRef.current,
          workingDirectory: workingDirectoryRef.current.trim() || undefined,
          titleManual: titleManualRef.current,
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

  const messagesForPersistRef = useRef(messages);
  messagesForPersistRef.current = messages;

  const flushThreadPersist = useCallback(() => {
    const snapshot = messagesForPersistRef.current;
    const prev = lastPersistedRef.current;
    if (
      prev?.threadId === threadId
      && threadMessagesEqual(prev.messages, snapshot)
    ) {
      return;
    }
    lastPersistedRef.current = { threadId, messages: snapshot };
    persistRef.current(threadId, snapshot);
  }, [threadId]);

  const repairToolCalls = useCallback(() => {
    setMessages((prev) => repairInterruptedToolCalls(prev));
  }, [setMessages]);

  const sendMessageSafe = useCallback(
    (payload: Parameters<typeof sendMessage>[0]) => {
      repairToolCalls();
      sendMessage(payload);
    },
    [repairToolCalls, sendMessage],
  );

  useEffect(() => {
    if (ephemeral) return;
    const timer = window.setTimeout(flushThreadPersist, CHAT_PERSIST_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      flushThreadPersist();
    };
  }, [ephemeral, flushThreadPersist, messages]);

  useEffect(() => {
    if (ephemeral) return;
    const interval = window.setInterval(
      flushThreadPersist,
      CHAT_PERSIST_MAX_INTERVAL_MS,
    );
    const onPageHide = () => flushThreadPersist();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", onPageHide);
      flushThreadPersist();
    };
  }, [ephemeral, flushThreadPersist, threadId]);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (ephemeral) return;
    const wasBusy = prev === "streaming" || prev === "submitted";
    const isIdle = status === "ready" || status === "error";
    if (wasBusy && isIdle) {
      flushThreadPersist();
    }
  }, [ephemeral, flushThreadPersist, status]);

  useActionProjectImportFromMessages(messages, !ephemeral);
  useBrowserPanelMessageSync(messages);

  useThreadTitleFromTool({
    threadId,
    visible: ephemeral ? false : visible,
    messages,
    status,
    currentTitle: threadTitle,
    titleGenerated,
    titleManual,
    onTitle: ephemeral ? () => {} : onAutoTitle,
  });

  const pendingApprovals = useMemo(
    () => collectPendingApprovals(messages),
    [messages],
  );
  const pendingApprovalCount = pendingApprovals.length;

  const pendingActionDeleteIds = useMemo(() => {
    const ids: string[] = [];
    for (const approval of pendingApprovals) {
      if (approval.toolName !== "qkrpc_action_delete") continue;
      const id = extractApprovalTargetId(approval.input);
      if (id) ids.push(id);
    }
    return ids;
  }, [pendingApprovals]);
  const pendingSubprogramDeleteIds = useMemo(() => {
    const ids: string[] = [];
    for (const approval of pendingApprovals) {
      if (approval.toolName !== "qkrpc_subprogram_delete") continue;
      const id = extractApprovalTargetId(approval.input);
      if (id) ids.push(id);
    }
    return ids;
  }, [pendingApprovals]);
  const pendingWorkspaceDeleteKey = [
    ...pendingActionDeleteIds,
    ...pendingSubprogramDeleteIds,
  ].join("\0");

  const [workspaceDeleteHits, setWorkspaceDeleteHits] = useState<
    WorkspaceDeleteProjectHit[]
  >([]);
  const [deleteWorkspaceToo, setDeleteWorkspaceToo] = useState(false);

  useEffect(() => {
    const cwd = workingDirectory.trim();
    if (
      !cwd
      || (pendingActionDeleteIds.length === 0
        && pendingSubprogramDeleteIds.length === 0)
    ) {
      setWorkspaceDeleteHits([]);
      setDeleteWorkspaceToo(false);
      return;
    }

    let cancelled = false;
    void fetchActionExplorerTree(cwd).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setWorkspaceDeleteHits([]);
        return;
      }
      setWorkspaceDeleteHits([
        ...findWorkspaceProjectsInTree(result.tree, pendingActionDeleteIds),
        ...findWorkspaceSubProgramsInTree(
          result.subprogramTree,
          pendingSubprogramDeleteIds,
        ),
      ]);
    });

    return () => {
      cancelled = true;
    };
  }, [workingDirectory, pendingWorkspaceDeleteKey]);

  useEffect(() => {
    setDeleteWorkspaceToo(false);
  }, [pendingWorkspaceDeleteKey, workspaceDeleteHits.length]);

  const busy = status === "submitted" || status === "streaming";
  const { queueLength, enqueueOrSend, clearQueue } = useComposerMessageQueue(
    busy,
    sendMessageSafe,
  );
  const qkrpcOk = ping.status === "ok";

  const { pinToBottom, getStickToBottom } = useMessagesStickScroll(messagesRef, {
    visible,
    threadId,
    revision: [messages, error, status],
  });

  useEffect(() => {
    const drainLauncherSubmit = () => {
      const pending = takeLauncherSubmit(threadId);
      if (!pending) return;
      if (!getLauncherSessionForThread(threadId)) return;
      if (pending.llmSelection) {
        setLlmSelection(pending.llmSelection);
        llmSelectionRef.current = pending.llmSelection;
        storeLauncherLlmSelectionRaw(pending.llmSelection);
      }
      voiceInterruptRef.current();
      clearError();
      if (visible) pinToBottom();
      enqueueOrSend(pending.text);
    };
    drainLauncherSubmit();
    return subscribeLauncherSubmit(drainLauncherSubmit);
  }, [threadId, visible, enqueueOrSend, pinToBottom, clearError]);

  useEffect(() => {
    const sessionId = getLauncherSessionForThread(threadId);
    if (!sessionId) return;

    const timer = window.setTimeout(() => {
      postLauncherSessionSync({
        sessionId,
        threadId,
        messages,
        status,
        error: error?.message ?? null,
        pendingApprovalCount,
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    threadId,
    messages,
    status,
    error,
    pendingApprovalCount,
  ]);

  useMessagesScrollportHeight(messagesRef, visible);

  useForwardWheelToMessages(messagesRef, appMainRef, visible);

  const userTurnStarts = useMemo(
    () => findUserTurnStartIndices(messages),
    [messages],
  );

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

  const messageWindow = useChatMessageWindow({
    containerRef: messagesRef,
    visible,
    threadId,
    userTurnStarts,
    totalMessages: messages.length,
    editAnchorIndex,
    revision: [messages, error, status],
    getStickToBottom,
  });

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
        !canEditUserMessage(message, userMessageDrafts)
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
      draftMessage,
      editAnchorMessageId,
      messages,
      userMessageDrafts,
      focusComposerAtEnd,
    ],
  );

  const readComposerText = useCallback(() => {
    return (composerRef.current?.getValue() ?? draftMessage).trim();
  }, [draftMessage]);

  const commitBranchMessageEdit = useCallback(() => {
    void (async () => {
    if (!editAnchorMessageId) return;
    const anchorIndex = findMessageIndex(messages, editAnchorMessageId);
    if (anchorIndex < 0) return;

    voiceInterruptRef.current();
    const text = readComposerText();
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
    readComposerText,
    enqueueOrSend,
    messages,
    pinToBottom,
    setMessages,
  ]);

  const submitComposer = useCallback(() => {
    voiceInterruptRef.current();
    if (editAnchorMessageId) {
      commitBranchMessageEdit();
      return;
    }
    const text = readComposerText();
    if (!canSendComposedMessage(text)) return;
    setDraftMessage("");
    pinToBottom();
    enqueueOrSend(text);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [
    readComposerText,
    editAnchorMessageId,
    commitBranchMessageEdit,
    enqueueOrSend,
    pinToBottom,
  ]);

  const sendTestPrompt = useCallback(
    (text: string) => {
      if (editAnchorMessageId) return;
      if (!canSendComposedMessage(text)) return;
      voiceInterruptRef.current();
      setDraftMessage("");
      clearError();
      pinToBottom();
      enqueueOrSend(text);
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [editAnchorMessageId, enqueueOrSend, pinToBottom, clearError],
  );

  const insertComposerPrompt = useCallback(
    (text: string) => {
      if (editAnchorMessageId) return;
      const next = text.trim();
      if (!next) return;
      voiceInterruptRef.current();
      clearError();
      setDraftMessage(next);
      requestAnimationFrame(() => composerRef.current?.focusAtEnd());
    },
    [editAnchorMessageId, clearError],
  );

  const voiceInput = useVoiceInput({
    enabled: visible && !ephemeral,
    onStreamBegin: () => {
      composerRef.current?.beginVoiceStream();
    },
    onStreamUpdate: (text) => {
      composerRef.current?.updateVoiceStream(text);
    },
    onStreamEnd: (finalText) => {
      composerRef.current?.endVoiceStream(finalText);
    },
    onStreamInterrupt: () => {
      composerRef.current?.endVoiceStream();
    },
    onStreamCancel: () => {
      composerRef.current?.cancelVoiceStream();
    },
  });

  voiceInterruptRef.current = voiceInput.interruptVoiceInput;

  const handleVoiceSetup = useCallback(() => {
    void requestVoicePluginSetup();
  }, []);

  useComposerVoiceToggleShortcut({
    enabled: !editAnchorMessageId,
    phase: voiceInput.phase,
    canUse: voiceInput.canUse,
    pluginStatus: voiceInput.pluginStatus,
    onStart: voiceInput.startVoiceInput,
    onStop: voiceInput.stopVoiceInput,
    onUnavailable: handleVoiceSetup,
  });

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

  const respondToAllPendingApprovals = useCallback(
    (approved: boolean, options?: { deleteWorkspace?: boolean }) => {
      for (const approval of pendingApprovals) {
        addToolApprovalResponse({
          id: approval.id,
          approved,
          reason: approved ? "用户点击批量确认" : "用户批量取消",
        });
      }

      if (
        approved
        && options?.deleteWorkspace
        && workspaceDeleteHits.length > 0
      ) {
        const cwd = workingDirectory.trim();
        if (cwd) {
          void Promise.all(
            workspaceDeleteHits.map((hit) =>
              deleteActionProjectApi(cwd, hit.projectPath),
            ),
          );
        }
      }
    },
    [
      addToolApprovalResponse,
      pendingApprovals,
      workspaceDeleteHits,
      workingDirectory,
    ],
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

  const lastTurnFillScrollport = useMsgTurnStickyActive(
    messagesRef,
    msgTurnRef,
    userTurnStarts.length > 0,
    [messages, error, status, agentActivity],
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
    busy,
    threadId,
  ]);

  const renderChatMessage = useCallback(
    (
      message: AgentUIMessage,
      messageIndex: number,
      stickyPrompt = false,
    ) => {
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
        isUser && canEditUserMessage(message, userMessageDrafts);

      const userText = isUser
        ? isEditAnchor
          ? draftMessage
          : resolveUserMessageDisplayText(message, userMessageDrafts)
        : undefined;

      const isLastMessage =
        message.id === lastVisibleMessageId && !agentActivity;
      const lastMessageMenu = isLastMessage ? (
        <LastMessageMoreMenu
          message={message}
          userTextOverride={userText}
        />
      ) : null;

      if (isUser) {
        const userArticleClass = `msg msg--user${message.id === lastVisibleMessageId && !agentActivity ? " msg--last" : ""}${isEditAnchor ? " msg--edit-anchor" : ""}${hasLocalDraft ? " msg--local-draft" : ""}${isAfterEditAnchor ? " msg--branch-cutoff" : ""}`;
        const userComposer = (
          <UserMessageComposerChrome
            message={message}
            messageId={message.id}
            userTextOverride={userText}
            interactive={userEditable && !isEditAnchor}
            isEditAnchor={isEditAnchor}
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
          />
        );

        if (stickyPrompt) {
          return (
            <div key={message.id} className="msg-turn__prompt">
              <article className={userArticleClass}>
                {userComposer}
                {lastMessageMenu}
              </article>
            </div>
          );
        }

        return (
          <article key={message.id} className={userArticleClass}>
            {userComposer}
            {lastMessageMenu}
          </article>
        );
      }

      return (
        <article
          key={message.id}
          className={`msg msg--assistant${message.id === lastVisibleMessageId && !agentActivity ? " msg--last" : ""}${isEditAnchor ? " msg--edit-anchor" : ""}${hasLocalDraft ? " msg--local-draft" : ""}${isAfterEditAnchor ? " msg--branch-cutoff" : ""}`}
        >
          <div className="msg-content">
            <div className="parts">
              <MessageParts
                message={message}
                workingDirectory={workingDirectory}
                onInsertComposerPrompt={insertComposerPrompt}
              />
            </div>
            {lastMessageMenu}
          </div>
        </article>
      );
    },
    [
      agentActivity,
      beginEditFromUserMessage,
      draftMessage,
      editAnchorIndex,
      editAnchorMessageId,
      insertComposerPrompt,
      focusComposerAtEnd,
      lastVisibleMessageId,
      messages,
      userMessageDrafts,
      workingDirectory,
    ],
  );

  const agentActivityBlock = agentActivity ? (
    <article
      className="msg msg--assistant msg--activity msg--last"
      aria-busy="true"
    >
      <div className="msg-content">
        <AgentActivityLine activity={agentActivity} />
      </div>
    </article>
  ) : null;

  const errorBanner = error ? (
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
  ) : null;

  const hiddenHistoryCount =
    messageWindow.hiddenTurnCount > 0
      ? messageWindow.hiddenTurnCount
      : messageWindow.hiddenMessageCount;

  const historySentinel =
    hiddenHistoryCount > 0 ? (
      <div
        ref={messageWindow.historySentinelRef}
        className="messages-history-sentinel"
      >
        <button
          type="button"
          className="messages-history-sentinel__btn"
          onClick={messageWindow.expandHistory}
        >
          {messageWindow.hiddenTurnCount > 0
            ? `加载更早的 ${messageWindow.hiddenTurnCount} 轮对话`
            : `加载更早的 ${messageWindow.hiddenMessageCount} 条消息`}
        </button>
      </div>
    ) : null;

  return (
    <div
      ref={appMainRef}
      className={`app-main${isEmptyThread ? " app-main--empty" : ""}${panelOpen ? " app-main--side-open" : ""}${visible ? "" : " app-main--hidden"}`}
      style={splitStyle}
      aria-hidden={visible ? undefined : true}
    >
      <div className="app-main-split-header">
        <div className="app-main-split-header__chat">
          <ChatConversationHeader title={threadTitle} />
        </div>
        {panelOpen && visible ? (
          <div className="app-main-split-header__side">
            <WorkspaceSidePanelTabBar />
          </div>
        ) : null}
      </div>
      <div ref={appMainBodyRef} className="app-main-body">
        <div className="app-main-chat-column">
      <div className="messages-view">
      <main
        ref={messagesRef}
        className={`messages${agentActivity ? " messages--agent-busy" : ""}`}
      >
        {historySentinel}
        {userTurnStarts.length === 0 ? (
          <>
            {messages
              .slice(messageWindow.startMessageIndex)
              .map((message, offset) =>
                renderChatMessage(
                  message,
                  messageWindow.startMessageIndex + offset,
                ),
              )}
            {agentActivityBlock}
            {errorBanner}
          </>
        ) : (
          userTurnStarts
            .slice(messageWindow.startTurnIndex)
            .map((startIndex, sliceTurnIndex) => {
            const turnIndex = messageWindow.startTurnIndex + sliceTurnIndex;
            const endIndex = userTurnStarts[turnIndex + 1] ?? messages.length;
            const isLastTurn = turnIndex === userTurnStarts.length - 1;
            return (
              <div
                key={messages[startIndex]!.id}
                ref={isLastTurn ? msgTurnRef : undefined}
                className={`msg-turn${isLastTurn && lastTurnFillScrollport ? " msg-turn--fill-scrollport" : ""}`}
              >
                {messages
                  .slice(startIndex, endIndex)
                  .map((message, offset) =>
                    renderChatMessage(
                      message,
                      startIndex + offset,
                      offset === 0,
                    ),
                  )}
                <TurnActionLinkCard
                  turnMessages={messages.slice(startIndex, endIndex)}
                  workingDirectory={workingDirectory}
                  onInsertComposerPrompt={insertComposerPrompt}
                />
                {isLastTurn ? agentActivityBlock : null}
                {isLastTurn ? errorBanner : null}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} className="messages-anchor" aria-hidden />
      </main>
      </div>

      {pendingApprovals.length > 0 && (
        <ApprovalDock
          approvals={pendingApprovals}
          disabled={busy}
          workspaceHits={workspaceDeleteHits}
          deleteWorkspaceToo={deleteWorkspaceToo}
          onDeleteWorkspaceTooChange={setDeleteWorkspaceToo}
          onApproveAll={(options) =>
            respondToAllPendingApprovals(true, options)}
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
        <ComposerShortcutCards
          settingsOpen={settingsOpen}
          onToggleSettings={onToggleSettings}
          disabled={busy}
        />
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
              onChange={setDraftMessage}
              onSubmit={submitComposer}
              onUserEdit={voiceInput.interruptVoiceInput}
            />
            <div className="composer-toolbar">
              <div className="composer-toolbar-left">
                <ActionTagSelector
                  ping={ping}
                  refreshKey={connectTick}
                  tagCount={draftTagCount}
                  embeddedTagIds={draftTagIds}
                  onSelect={insertDraftActionTag}
                />
                {!ephemeral ? (
                  <ChatModeSelector
                    mode={chatMode}
                    onChange={(next) => {
                      setChatMode(next);
                      storeChatMode(next);
                    }}
                  />
                ) : null}
                {devExperienceEnabled ? (
                  <ToolSelector
                    enabledTools={enabledTools}
                    onChange={setEnabledTools}
                  />
                ) : null}
                {devExperienceEnabled ? (
                  <ComposerTestPromptsPicker
                    disabled={!qkrpcOk}
                    onSendPrompt={sendTestPrompt}
                  />
                ) : null}
                <ModelSelector
                  selection={llmSelection}
                  onChange={(next) => {
                    setLlmSelection(next);
                    storeLlmSelectionRaw(next);
                  }}
                  onNeedSettings={() => onOpenSettings()}
                />
                {voiceInput.errorHint ? (
                  <span className="composer-hint" role="status">
                    <span className="composer-voice-hint composer-voice-hint--err">
                      {voiceInput.errorHint}
                    </span>
                  </span>
                ) : voiceInput.statusHint ? (
                  <span className="composer-hint" role="status">
                    <span className="composer-voice-hint">
                      {voiceInput.statusHint}
                    </span>
                  </span>
                ) : editAnchorMessageId ? (
                  <span className="composer-hint">Enter 发送并分支</span>
                ) : queueLength > 0 ? (
                  <span className="composer-hint">{`已排队 ${queueLength} 条`}</span>
                ) : null}
              </div>
              <div className="composer-toolbar-actions">
                {!isEmptyThread && (
                  <ContextUsage
                    messages={messages}
                    busy={busy}
                    selection={llmSelection}
                  />
                )}
                {busy && (
                  <button
                    type="button"
                    className="composer-btn composer-btn--stop"
                    onClick={() => {
                      clearQueue();
                      stop();
                      repairToolCalls();
                      clearError();
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
                <ComposerPrimaryActionButton
                  canSend={canSend}
                  agentBusy={busy}
                  phase={voiceInput.phase}
                  pluginStatus={voiceInput.pluginStatus}
                  canUseVoice={voiceInput.canUse}
                  onVoiceStart={voiceInput.startVoiceInput}
                  onVoiceStop={voiceInput.stopVoiceInput}
                  onVoiceSetup={handleVoiceSetup}
                />
              </div>
            </div>
            </div>
          </div>
        </form>
      </footer>
        </div>
        {visible ? <WorkspaceExplorerPanel /> : null}
      </div>
    </div>
  );
}

export function Chat() {
  const { store, defaultCwd, defaultCwdProfile, defaultCwdReady, updateStore } =
    useChatStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFocusProviderId, setSettingsFocusProviderId] = useState<
    LlmProviderId | undefined
  >(undefined);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    AppSettingsTabId | undefined
  >(undefined);
  const [ephemeralLauncherRuns, setEphemeralLauncherRuns] = useState(
    getEphemeralLauncherRuns,
  );
  const { ping, refreshPing, connectTick } = useQkrpcPing();
  useLauncherGlobalShortcut();
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
      queueMicrotask(() => dispatchWorkspaceLayoutResize());
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
    },
    [updateStore],
  );

  const openSettings = useCallback((
    targetProviderId?: LlmProviderId,
    tab?: AppSettingsTabId,
  ) => {
    setSettingsFocusProviderId(targetProviderId);
    if (tab) {
      setSettingsInitialTab(tab);
    } else if (targetProviderId) {
      setSettingsInitialTab("models");
    } else {
      setSettingsInitialTab(undefined);
    }
    setSettingsOpen(true);
  }, []);

  useEffect(() => {
    return subscribeEphemeralLauncherRuns(() => {
      setEphemeralLauncherRuns(getEphemeralLauncherRuns());
    });
  }, []);

  useEffect(() => {
    return subscribeLauncherBridge((message) => {
      if (message.type === "composer:submit") {
        const threadId = startEphemeralLauncherRun(message.sessionId);
        queueLauncherSubmit(threadId, message.text, message.llmSelection);
        return;
      }
      if (message.type === "launcher:session-clear") {
        clearEphemeralLauncherRuns();
      }
    });
  }, []);

  const llmSettingsAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (llmSettingsAutoOpenedRef.current) return;
    let cancelled = false;
    void (async () => {
      const data = await fetchLlmOptions();
      if (cancelled || !data || hasConfiguredLlmOption(data)) return;
      llmSettingsAutoOpenedRef.current = true;
      openSettings();
    })();
    return () => {
      cancelled = true;
    };
  }, [openSettings]);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setSettingsFocusProviderId(undefined);
    setSettingsInitialTab(undefined);
  }, []);

  const toggleSettings = useCallback(() => {
    if (settingsOpen) {
      closeSettings();
    } else {
      openSettings();
    }
  }, [settingsOpen, closeSettings, openSettings]);

  const activeThread = getActiveThread(store);
  const workingDirectory = store.workingDirectory.trim() || defaultCwd;
  const cwdPending = !store.workingDirectory.trim() && !defaultCwdReady;

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
            defaultCwdReady={defaultCwdReady}
            onChange={updateStore}
            onActivateThread={handleActivateThread}
          />
        </div>
        <div className="app-main-column">
          <WorkspaceExplorerPanelProvider
            cwd={workingDirectory}
            cwdPending={cwdPending}
          >
            <DocsViewerProvider>
              <EmbeddedBrowserProvider>
              <WorkspaceMainEditorTabBridgeRegistrar />
              <ChatTitlebar
                store={store}
                onChange={updateStore}
              />
              <ReleasePreviewBanner />
              <div className="app-content-row">
                <div className="app-main-shell">
                  <AppMainWorkspaceSplit>
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
                        settingsOpen={settingsOpen}
                        onToggleSettings={toggleSettings}
                        onOpenSettings={openSettings}
                        onPersist={persistMessages}
                        onAutoTitle={handleAutoTitle}
                      />
                    ))}
                    {ephemeralLauncherRuns.map((run) => (
                      <ChatPanel
                        key={run.threadId}
                        threadId={run.threadId}
                        initialMessages={[]}
                        workingDirectory={workingDirectory}
                        visible={false}
                        ephemeral
                        threadTitle=""
                        titleGenerated={false}
                        titleManual={false}
                        ping={ping}
                        connectTick={connectTick}
                        settingsOpen={settingsOpen}
                        onToggleSettings={toggleSettings}
                        onOpenSettings={openSettings}
                        onPersist={() => {}}
                        onAutoTitle={() => {}}
                      />
                    ))}
                  </AppMainWorkspaceSplit>
                </div>
              </div>
              <AppSettingsPopup
                open={settingsOpen}
                onClose={closeSettings}
                ping={ping}
                onRefreshPing={refreshPing}
                versionRefreshKey={connectTick}
                focusProviderId={settingsFocusProviderId}
                initialTab={settingsInitialTab}
              />
              </EmbeddedBrowserProvider>
            </DocsViewerProvider>
          </WorkspaceExplorerPanelProvider>
        </div>
      </div>
    </WorkspaceExplorerShellProvider>
  );
}
