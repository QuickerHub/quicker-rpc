"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { lastAssistantMessageIsCompleteWithClientResponses } from "@/lib/chat-auto-submit";
import { ChatToolActionsProvider } from "@/lib/chat-tool-actions";
import { collectPendingAskQuestions } from "@/lib/ask-question-tool";
import { AskQuestionDock } from "@/components/chat/AskQuestionDock";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { canSendComposedMessage } from "@/lib/compose-user-message";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  getToolMeta,
  loadStoredEnabledTools,
} from "@/lib/tool-registry";
import { extractApprovalTargetId } from "@/lib/tool-approval-display";
import { collectPendingApprovals } from "@/lib/collect-pending-approvals";
import { ApprovalDock } from "@/components/chat/ApprovalDock";
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
  hydrateStoreThreadMessagesAsync,
  resolveThreadWorkingDirectory,
  updateThreadMessages,
  updateThreadTitle,
  type ChatStoreData,
} from "@/lib/chat-store";
import {
  postLauncherSessionSync,
  subscribeLauncherBridge,
} from "@/lib/launcher/launcher-bridge";
import {
  dispatchLauncherApprovalResponse,
  dispatchLauncherToolOutput,
  registerLauncherSessionHandlers,
} from "@/lib/launcher/launcher-action-dispatch";
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
import { ChatStoragePortBanner } from "@/components/dev/ChatStoragePortBanner";
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
import { ThreadSidePanelSync } from "@/lib/use-thread-side-panel-sync";
import { useBrowserPanelMessageSync } from "@/lib/use-browser-panel-message-sync";
import { WorkspaceMainEditorTabBridgeRegistrar } from "@/components/workspace/WorkspaceMainEditorTabBridgeRegistrar";
import {
  isChatStoreHydrated,
  useChatStore,
  useIsChatStoreHydrated,
} from "@/lib/use-chat-store";
import {
  ChatComposerFooter,
  type ChatComposerFooterHandle,
} from "./ChatComposerFooter";
import { ChatMessageArticle } from "./ChatMessageArticle";
import { TurnActionLinkCard } from "./TurnActionLinkCard";
import {
  fetchLlmOptions,
  hasConfiguredLlmOption,
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
import { CollapsedTurnSummary } from "@/components/chat/CollapsedTurnSummary";
import { isHotTurnIndex, turnIndicesPrepended } from "@/lib/chat-message-window";
import { buildChatScrollRevisionKey } from "@/lib/chat-scroll-revision";
import type { BrowserElementTag } from "@/lib/browser-element-tag";
import { chatComposerActionsRef } from "@/lib/chat-composer-bridge";
import { useMessagesStickScroll } from "@/lib/use-messages-stick-scroll";
import { useChatMessageWindow } from "@/lib/use-chat-message-window";
import { findUserTurnStartIndices } from "@/lib/last-user-turn-index";
import { useForwardWheelToMessages } from "@/lib/use-forward-wheel-to-messages";
import { useMessagesScrollportHeight } from "@/lib/use-messages-scrollport-height";
import { useAutoExpandColdTurns } from "@/lib/use-auto-expand-cold-turns";
import { useMsgTurnStickyActive } from "@/lib/use-msg-turn-sticky-active";
import { useThreadTitleFromTool } from "@/lib/use-thread-title-from-tool";
import { useComposerMessageQueue } from "@/lib/use-composer-message-queue";
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
import { isTauriDevShell } from "@/lib/tauri-shell";
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
  onPersist: (
    threadId: string,
    messages: AgentUIMessage[],
    options?: { notify?: boolean },
  ) => void;
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
  const [editAnchorLiveDraft, setEditAnchorLiveDraft] = useState("");
  const [editAnchorMessageId, setEditAnchorMessageId] = useState<string | null>(
    null,
  );
  const [userMessageDrafts, setUserMessageDrafts] = useState<
    Record<string, string>
  >({});
  const [enabledTools, setEnabledTools] = useState(() => loadStoredEnabledTools());
  const [chatMode, setChatMode] = useState<ChatMode>(() =>
    ephemeral ? CHAT_MODE_LAUNCHER : loadStoredChatMode(),
  );
  const [llmSelection, setLlmSelection] = useState(() => {
    const fallback = formatLlmSelection({
      kind: "builtin",
      providerId: LLM_PROVIDER_ID,
    });
    if (typeof window === "undefined") return fallback;
    const stored = ephemeral
      ? loadLauncherLlmSelectionRaw()
      : loadStoredLlmSelectionRaw();
    return stored ?? fallback;
  });
  const devExperienceEnabled = useDevExperienceEnabled();
  const { panelOpen } = useWorkspaceExplorerShell();
  const appMainBodyRef = useRef<HTMLDivElement>(null);
  const splitStyle = useAppMainSplit(appMainBodyRef, panelOpen);

  useEffect(() => {
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
  const appMainChatColumnRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLElement>(null);
  const msgTurnRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ChatComposerFooterHandle>(null);
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
    addToolOutput,
  } = useChat<AgentUIMessage>({
      id: threadId,
      messages: initialMessages,
      transport: chatTransport,
      experimental_throttle: 100,
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithClientResponses,
    });

  const messagesForPersistRef = useRef(messages);
  messagesForPersistRef.current = messages;

  const busyPersist =
    status === "streaming" || status === "submitted";
  const busyPersistRef = useRef(busyPersist);
  busyPersistRef.current = busyPersist;

  const flushThreadPersist = useCallback(() => {
    if (!isChatStoreHydrated()) return;
    const snapshot = messagesForPersistRef.current;
    lastPersistedRef.current = { threadId, messages: snapshot };
    persistRef.current(threadId, snapshot, {
      notify: !busyPersistRef.current,
    });
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
    if (ephemeral || !visible) return;
    const debounceMs = busyPersist
      ? CHAT_PERSIST_MAX_INTERVAL_MS
      : CHAT_PERSIST_DEBOUNCE_MS;
    const timer = window.setTimeout(flushThreadPersist, debounceMs);
    return () => {
      window.clearTimeout(timer);
      if (!busyPersist) {
        flushThreadPersist();
      }
    };
  }, [busyPersist, ephemeral, flushThreadPersist, messages, visible]);

  useEffect(() => {
    if (ephemeral || !visible) return;
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
  }, [ephemeral, flushThreadPersist, threadId, visible]);

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

  useActionProjectImportFromMessages(messages, !ephemeral && visible);
  useBrowserPanelMessageSync(messages, { enabled: !ephemeral && visible });

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
  const pendingAskQuestions = useMemo(
    () => collectPendingAskQuestions(messages),
    [messages],
  );
  const pendingAskQuestionCount = pendingAskQuestions.length;
  const activePendingAskQuestion = pendingAskQuestions[0] ?? null;

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

  const interruptAgentRun = useCallback(() => {
    stop();
    repairToolCalls();
    clearError();
  }, [stop, repairToolCalls, clearError]);

  const {
    queueLength,
    queuedMessages,
    enqueueOrSend,
    clearQueue,
    removeFromQueue,
    flushNextQueuedNow,
  } = useComposerMessageQueue(busy, sendMessageSafe, interruptAgentRun);
  const qkrpcOk = ping.status === "ok";

  const scrollRevisionKey = useMemo(
    () => buildChatScrollRevisionKey(messages, status, error),
    [messages, status, error],
  );

  const {
    pinToBottom: pinToBottomInner,
    pinToLastTurnPrompt,
    getStickToBottom,
    releaseStickToBottom,
  } = useMessagesStickScroll(messagesRef, {
    visible,
    threadId,
    revision: scrollRevisionKey,
    turnRef: msgTurnRef,
  });

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
        pendingAskQuestionCount,
        pendingApprovals,
        workspaceDeleteHits,
      });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    threadId,
    messages,
    status,
    error,
    pendingApprovalCount,
    pendingAskQuestionCount,
    pendingApprovals,
    workspaceDeleteHits,
  ]);

  useMessagesScrollportHeight(messagesRef, visible);

  useForwardWheelToMessages(messagesRef, appMainChatColumnRef, visible);

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

  const editAnchorIndex = useMemo(
    () =>
      editAnchorMessageId
        ? findMessageIndex(messages, editAnchorMessageId)
        : -1,
    [messages, editAnchorMessageId],
  );

  const streamingActive = busy;

  const [expandedColdTurns, setExpandedColdTurns] = useState<Set<number>>(
    () => new Set(),
  );

  useEffect(() => {
    setExpandedColdTurns(new Set());
  }, [threadId]);

  const messageWindow = useChatMessageWindow({
    containerRef: messagesRef,
    visible,
    threadId,
    userTurnStarts,
    totalMessages: messages.length,
    editAnchorIndex,
    revision: scrollRevisionKey,
    getStickToBottom,
    releaseStickToBottom,
    streamingActive,
  });

  const pinToStream = useCallback(() => {
    messageWindow.clearHistoryPin();
    if (userTurnStarts.length > 0) {
      pinToLastTurnPrompt();
    } else {
      pinToBottomInner();
    }
  }, [
    messageWindow.clearHistoryPin,
    pinToBottomInner,
    pinToLastTurnPrompt,
    userTurnStarts.length,
  ]);

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
      if (visible) pinToStream();
      enqueueOrSend(pending.text);
    };
    drainLauncherSubmit();
    return subscribeLauncherSubmit(drainLauncherSubmit);
  }, [threadId, visible, enqueueOrSend, pinToStream, clearError]);

  const registerColdTurnNode = useAutoExpandColdTurns({
    containerRef: messagesRef,
    visible,
    revision: `${messageWindow.startTurnIndex}:${messageWindow.hiddenTurnCount}:${messages.length}`,
    setExpandedColdTurns,
  });

  const prevStartTurnIndexRef = useRef(messageWindow.startTurnIndex);
  useEffect(() => {
    const prev = prevStartTurnIndexRef.current;
    const next = messageWindow.startTurnIndex;
    prevStartTurnIndexRef.current = next;
    const prepended = turnIndicesPrepended(prev, next);
    if (prepended.length === 0) return;
    setExpandedColdTurns((current) => {
      const merged = new Set(current);
      let changed = false;
      for (const turnIndex of prepended) {
        if (merged.has(turnIndex)) continue;
        merged.add(turnIndex);
        changed = true;
      }
      return changed ? merged : current;
    });
  }, [messageWindow.startTurnIndex]);

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
    const savedDraft = composerRef.current?.getValue() ?? "";
    setEditAnchorMessageId(null);
    setEditAnchorLiveDraft("");
    composerRef.current?.clear();
    if (!message) return;
    setUserMessageDrafts((prev) =>
      upsertUserMessageDraft(message, savedDraft, prev),
    );
  }, [editAnchorMessageId, messages]);

  const discardMessageEditSession = useCallback(() => {
    setEditAnchorMessageId(null);
    setEditAnchorLiveDraft("");
    composerRef.current?.clear();
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
          const savedDraft = composerRef.current?.getValue() ?? "";
          setUserMessageDrafts((prev) =>
            upsertUserMessageDraft(previous, savedDraft, prev),
          );
        }
      }

      const nextText = resolveUserMessageDisplayText(message, userMessageDrafts);
      setEditAnchorMessageId(message.id);
      setEditAnchorLiveDraft(nextText);
      composerRef.current?.setValue(nextText);
      clearError();
      focusComposerAtEnd();
    },
    [
      clearError,
      editAnchorMessageId,
      messages,
      userMessageDrafts,
      focusComposerAtEnd,
    ],
  );

  const readComposerText = useCallback(() => {
    return (composerRef.current?.getValue() ?? "").trim();
  }, []);

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
    setEditAnchorLiveDraft("");
    composerRef.current?.clear();
    setUserMessageDrafts((prev) =>
      clearUserMessageDraftsFromIndex(messages, anchorIndex, prev),
    );
    setMessages(messages.slice(0, anchorIndex));
    pinToStream();
    enqueueOrSend(text);
    })();
  }, [
    editAnchorMessageId,
    readComposerText,
    enqueueOrSend,
    messages,
    pinToStream,
    setMessages,
  ]);

  const submitComposer = useCallback(() => {
    voiceInterruptRef.current();
    if (editAnchorMessageId) {
      commitBranchMessageEdit();
      return;
    }
    const text = readComposerText();
    if (canSendComposedMessage(text)) {
      composerRef.current?.clear();
      pinToStream();
      enqueueOrSend(text);
      requestAnimationFrame(() => composerRef.current?.focus());
      return;
    }
    if (busy && queueLength > 0) {
      pinToStream();
      flushNextQueuedNow();
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  }, [
    readComposerText,
    editAnchorMessageId,
    commitBranchMessageEdit,
    enqueueOrSend,
    pinToStream,
    busy,
    queueLength,
    flushNextQueuedNow,
  ]);

  const sendTestPrompt = useCallback(
    (text: string) => {
      if (editAnchorMessageId) return;
      if (!canSendComposedMessage(text)) return;
      voiceInterruptRef.current();
      composerRef.current?.clear();
      clearError();
      pinToStream();
      enqueueOrSend(text);
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [editAnchorMessageId, enqueueOrSend, pinToStream, clearError],
  );

  const insertComposerPrompt = useCallback(
    (text: string) => {
      if (editAnchorMessageId) return;
      const next = text.trim();
      if (!next) return;
      voiceInterruptRef.current();
      clearError();
      composerRef.current?.setValue(next);
    },
    [editAnchorMessageId, clearError],
  );

  const insertComposerBrowserElementTag = useCallback(
    (element: BrowserElementTag) => {
      if (editAnchorMessageId) return;
      voiceInterruptRef.current();
      clearError();
      composerRef.current?.insertBrowserElementTag(element);
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [editAnchorMessageId, clearError],
  );

  useEffect(() => {
    if (ephemeral) return;
    chatComposerActionsRef.current = {
      insertPrompt: insertComposerPrompt,
      insertBrowserElementTag: insertComposerBrowserElementTag,
      focusComposer: focusComposerAtEnd,
    };
    return () => {
      chatComposerActionsRef.current = {
        insertPrompt: () => {},
        insertBrowserElementTag: () => {},
        focusComposer: () => {},
      };
    };
  }, [ephemeral, focusComposerAtEnd, insertComposerBrowserElementTag, insertComposerPrompt]);

  const handleChatModeChange = useCallback((next: ChatMode) => {
    setChatMode(next);
    storeChatMode(next);
  }, []);

  const handleLlmSelectionChange = useCallback(
    (next: string) => {
      setLlmSelection(next);
      if (ephemeral) {
        storeLauncherLlmSelectionRaw(next);
      } else {
        storeLlmSelectionRaw(next);
      }
    },
    [ephemeral],
  );

  const handleComposerStop = useCallback(() => {
    clearQueue();
    interruptAgentRun();
  }, [clearQueue, interruptAgentRun]);

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

  useEffect(() => {
    if (!ephemeral) return;
    const sessionId = getLauncherSessionForThread(threadId);
    if (!sessionId) return;
    return registerLauncherSessionHandlers(sessionId, {
      addToolOutput,
      respondToAllPendingApprovals,
    });
  }, [
    ephemeral,
    threadId,
    addToolOutput,
    respondToAllPendingApprovals,
  ]);

  const qkrpcLoading = ping.status === "loading";
  const agentActivity = useMemo(
    () =>
      resolveAgentActivity({
        chatStatus: status,
        messages,
        qkrpcOk,
        qkrpcLoading,
        pendingApprovalCount,
        pendingAskQuestionCount,
      }),
    [status, messages, qkrpcOk, qkrpcLoading, pendingApprovalCount, pendingAskQuestionCount],
  );

  const lastTurnFillScrollport = useMsgTurnStickyActive(
    messagesRef,
    msgTurnRef,
    visible && userTurnStarts.length > 0,
    threadId,
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
      const isLastMessage =
        message.id === lastVisibleMessageId && !agentActivity;
      const isColdMessage =
        message.id !== lastVisibleMessageId && !isEditAnchor;

      return (
        <ChatMessageArticle
          key={message.id}
          message={message}
          messageIndex={messageIndex}
          stickyPrompt={stickyPrompt}
          isEditAnchor={isEditAnchor}
          editAnchorLiveDraft={isEditAnchor ? editAnchorLiveDraft : undefined}
          isAfterEditAnchor={isAfterEditAnchor}
          hasLocalDraft={hasLocalDraft}
          userEditable={userEditable}
          isLastMessage={isLastMessage}
          isColdMessage={isColdMessage}
          agentActivity={!!agentActivity}
          workingDirectory={workingDirectory}
          userMessageDisplayText={resolveUserMessageDisplayText(
            message,
            userMessageDrafts,
          )}
          onBeginEdit={beginEditFromUserMessage}
          onFocusComposerAtEnd={focusComposerAtEnd}
          onInsertComposerPrompt={insertComposerPrompt}
        />
      );
    },
    [
      agentActivity,
      beginEditFromUserMessage,
      editAnchorLiveDraft,
      editAnchorIndex,
      editAnchorMessageId,
      insertComposerPrompt,
      focusComposerAtEnd,
      lastTurnFillScrollport,
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
            ? `向上滚动以加载更早的 ${messageWindow.hiddenTurnCount} 轮对话`
            : `向上滚动以加载更早的 ${messageWindow.hiddenMessageCount} 条消息`}
        </button>
      </div>
    ) : null;

  return (
    <ChatToolActionsProvider addToolOutput={addToolOutput}>
    <div
      ref={appMainRef}
      className={`app-main${isEmptyThread ? " app-main--empty" : ""}${panelOpen ? " app-main--side-open" : ""}${visible ? "" : " app-main--hidden"}`}
      style={splitStyle}
      aria-hidden={visible ? undefined : true}
    >
      <div className="app-main-split-header">
        <div className="app-main-split-header__chat">
          <ChatConversationHeader />
        </div>
        {panelOpen && visible ? (
          <div className="app-main-split-header__side">
            <WorkspaceSidePanelTabBar />
          </div>
        ) : null}
      </div>
      <div ref={appMainBodyRef} className="app-main-body">
        <div ref={appMainChatColumnRef} className="app-main-chat-column">
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
            const isHotTurn =
              isHotTurnIndex(turnIndex, userTurnStarts.length)
              || expandedColdTurns.has(turnIndex);
            const turnMessageCount = endIndex - startIndex;

            if (!isHotTurn) {
              return (
                <CollapsedTurnSummary
                  key={messages[startIndex]!.id}
                  turnIndex={turnIndex}
                  turnNumber={turnIndex + 1}
                  messageCount={turnMessageCount}
                  ref={registerColdTurnNode}
                  onExpand={() => {
                    setExpandedColdTurns((prev) => {
                      const next = new Set(prev);
                      next.add(turnIndex);
                      return next;
                    });
                  }}
                />
              );
            }

            return (
              <div
                key={messages[startIndex]!.id}
                ref={isLastTurn ? msgTurnRef : undefined}
                className={`msg-turn msg-turn--hot${isLastTurn && lastTurnFillScrollport ? " msg-turn--fill-scrollport" : ""}`}
              >
                {messages
                  .slice(startIndex, endIndex)
                  .map((message, offset) =>
                    renderChatMessage(
                      message,
                      startIndex + offset,
                      offset === 0 && isLastTurn && lastTurnFillScrollport,
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

      {activePendingAskQuestion ? (
        <AskQuestionDock
          pending={activePendingAskQuestion}
          disabled={busy}
        />
      ) : null}

      <ChatComposerFooter
        ref={composerRef}
        visible={visible}
        ephemeral={ephemeral}
        editAnchorMessageId={editAnchorMessageId}
        isEmptyThread={isEmptyThread}
        busy={busy}
        queueLength={queueLength}
        queuedMessages={queuedMessages}
        onRemoveFromQueue={removeFromQueue}
        settingsOpen={settingsOpen}
        messages={messages}
        ping={ping}
        connectTick={connectTick}
        qkrpcOk={qkrpcOk}
        devExperienceEnabled={devExperienceEnabled}
        chatMode={chatMode}
        enabledTools={enabledTools}
        llmSelection={llmSelection}
        onChatModeChange={handleChatModeChange}
        onEnabledToolsChange={setEnabledTools}
        onLlmSelectionChange={handleLlmSelectionChange}
        onToggleSettings={onToggleSettings}
        onOpenSettings={onOpenSettings}
        onSubmit={submitComposer}
        onSendTestPrompt={sendTestPrompt}
        onStop={handleComposerStop}
        onExitEdit={exitMessageEdit}
        onEditAnchorDraftChange={setEditAnchorLiveDraft}
        voiceInterruptRef={voiceInterruptRef}
      />
        </div>
        {visible ? <WorkspaceExplorerPanel /> : null}
      </div>
    </div>
    </ChatToolActionsProvider>
  );
}

export function Chat() {
  const { store, defaultCwd, defaultCwdProfile, defaultCwdReady, updateStore } =
    useChatStore();
  const chatStoreHydrated = useIsChatStoreHydrated();
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
  const { ping, refreshPing, connectTick } = useQkrpcPing(
    isTauriDevShell() ? { pollIntervalMs: 45_000 } : undefined,
  );
  const storeRef = useRef(store);
  storeRef.current = store;

  // Async open-tab hydration result, tagged with the store it was derived
  // from. A copy derived from an older store must never be rendered or
  // written back: doing so clobbers the API-loaded store with the stale
  // pre-hydration default (lost history + reverted edits, see v0.13.1).
  const [hydratedOpenTabs, setHydratedOpenTabs] = useState<{
    source: ChatStoreData;
    value: ChatStoreData;
  } | null>(null);

  useEffect(() => {
    if (!chatStoreHydrated) return;
    let cancelled = false;
    void (async () => {
      let next = store;
      for (const threadId of store.openTabIds) {
        next = await hydrateStoreThreadMessagesAsync(next, threadId);
      }
      if (!cancelled && next !== store) {
        setHydratedOpenTabs({ source: store, value: next });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatStoreHydrated, store]);

  const storeWithOpenTabMessages =
    hydratedOpenTabs && hydratedOpenTabs.source === store
      ? hydratedOpenTabs.value
      : store;
  const activeThread = getActiveThread(storeWithOpenTabMessages);
  const openTabThreads = useMemo(
    () => getOpenTabThreads(storeWithOpenTabMessages),
    [storeWithOpenTabMessages],
  );
  storeRef.current = storeWithOpenTabMessages;

  useEffect(() => {
    if (!chatStoreHydrated) return;
    if (!hydratedOpenTabs || hydratedOpenTabs.source !== store) return;
    if (hydratedOpenTabs.value === store) return;
    updateStore(hydratedOpenTabs.value);
  }, [chatStoreHydrated, store, hydratedOpenTabs, updateStore]);

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
    (
      threadId: string,
      messages: AgentUIMessage[],
      options?: { notify?: boolean },
    ) => {
      const next = updateThreadMessages(storeRef.current, threadId, messages);
      storeRef.current = next;
      updateStore(next, options);
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
      void (async () => {
        let next = openThread(storeRef.current, threadId);
        next = await hydrateStoreThreadMessagesAsync(next, threadId);
        updateStore(next);
      })();
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
        return;
      }
      if (message.type === "launcher:tool-output") {
        dispatchLauncherToolOutput(message.sessionId, message.payload);
        return;
      }
      if (message.type === "launcher:approval-respond") {
        dispatchLauncherApprovalResponse(
          message.sessionId,
          message.approved,
          message.deleteWorkspace !== undefined
            ? { deleteWorkspace: message.deleteWorkspace }
            : undefined,
        );
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
      openSettings(undefined, "models");
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

  const resolveThreadCwd = useCallback(
    (thread: { workspaceId?: string }) =>
      resolveThreadWorkingDirectory(thread, store, defaultCwd),
    [store, defaultCwd],
  );
  const activeThreadWorkingDirectory = useMemo(
    () => resolveThreadCwd(getActiveThread(storeWithOpenTabMessages)),
    [resolveThreadCwd, storeWithOpenTabMessages],
  );
  const cwdPending = !activeThreadWorkingDirectory.trim() && !defaultCwdReady;

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
            cwd={activeThreadWorkingDirectory}
            cwdPending={cwdPending}
          >
            <DocsViewerProvider>
              <EmbeddedBrowserProvider>
              <ThreadSidePanelSync activeThreadId={activeThread.id} />
              <WorkspaceMainEditorTabBridgeRegistrar />
              <ChatTitlebar
                store={storeWithOpenTabMessages}
                onChange={updateStore}
              />
              <ChatStoragePortBanner store={storeWithOpenTabMessages} />
              <ReleasePreviewBanner />
              <div className="app-content-row">
                <div className="app-main-shell">
                  <AppMainWorkspaceSplit>
                    {chatStoreHydrated
                      && openTabThreads.map((thread) => (
                      <ChatPanel
                        key={thread.id}
                        threadId={thread.id}
                        initialMessages={thread.messages}
                        workingDirectory={resolveThreadCwd(thread)}
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
                        workingDirectory={activeThreadWorkingDirectory}
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
