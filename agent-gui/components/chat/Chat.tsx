"use client";

import { ChatToolActionsProvider } from "@/lib/chat-tool-actions";
import { collectPendingAskQuestions } from "@/lib/ask-question-tool";
import { AskQuestionDock } from "@/components/chat/AskQuestionDock";
import { AppLoadingIndicator } from "@/components/shell/AppLoadingIndicator";
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
  applyThreadMessagesToStore,
  forkThread,
  getActiveThread,
  getOpenTabThreads,
  hydrateStoreThreadsParallel,
  resolveThreadWorkingDirectory,
  updateThreadMessages,
  updateThreadTitle,
  type ChatStoreData,
} from "@/lib/chat-store";
import { activateThreadWithLazyHydration } from "@/lib/chat-thread-activation";
import { getChatStoreSnapshotSync } from "@/lib/use-chat-store";
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
import {
  actionDesignerRefFromEmbed,
  type ActionDesignerThreadRef,
} from "@/lib/action-designer-thread";
import { useActionDesignerEmbed } from "@/lib/designer-embed-context";
import { useDesignerContext } from "@/lib/use-designer-context";
import { dispatchWorkspaceLayoutResize } from "@/lib/embedded-webview-bounds";
import { setThreadRunBusy } from "@/lib/thread-run-status";
import { notifyBackgroundThreadRunComplete } from "@/lib/thread-run-complete-notify";
import { clearThreadNeedsAttention } from "@/lib/thread-attention";
import { listenDesktop } from "@/lib/desktop-bridge";
import {
  THREAD_NOTIFICATION_ACTIVATE_EVENT,
  type ThreadNotificationActivateDetail,
} from "@/lib/desktop-native-notification";
import { useAppMainSplit } from "@/lib/use-app-main-split";
import { ChatTitlebar } from "@/components/chat/ChatTitlebar";
import { DesignerEmbedContextBar } from "@/components/chat/DesignerEmbedContextBar";
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
import { EmbeddedTerminalProvider } from "@/lib/embedded-terminal-context";
import { EmbeddedTerminalTabsProvider } from "@/lib/embedded-terminal-tabs";
import { EmbeddedBrowserTabsProvider } from "@/lib/embedded-browser-tabs";
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
import type { ProgramStepTag } from "@/lib/program-step-tag";
import {
  registerChatComposerActions,
  unregisterChatComposerActions,
} from "@/lib/chat-composer-bridge";
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
  type ChatMode,
} from "@/lib/chat-mode";
import {
  loadStoredChatMode,
  storeChatMode,
} from "@/lib/chat-mode-prefs";
import { useActionProjectImportFromMessages } from "@/lib/action-project-import-from-messages";
import { useReloadProgramDataFromToolMessages } from "@/lib/program-data-reload-from-tools";
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
import { useAgentChatSession } from "@/components/chat/useAgentChatSession";
import { formatChatError } from "@/lib/chat-error-format";
import {
  exportThreadLikeWithLiveMessages,
  useChatThreadExportDialog,
} from "@/lib/use-chat-thread-export-dialog";

type ChatPanelProps = {
  threadId: string;
  initialMessages: AgentUIMessage[];
  workingDirectory: string;
  visible?: boolean;
  ephemeral?: boolean;
  threadTitle: string;
  threadUpdatedAt: number;
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
  onForkThread?: (
    threadId: string,
    messages: AgentUIMessage[],
    upToMessageId: string,
  ) => void;
  onActivateThread?: () => void;
  designerEmbed?: boolean;
  /** Scoped Action Designer embed — enables designer prompt + actionDesigner on API. */
  designerEmbedScoped?: boolean;
  actionDesigner?: ActionDesignerThreadRef;
};

function ChatPanel({
  threadId,
  initialMessages,
  workingDirectory,
  visible = true,
  ephemeral = false,
  threadTitle,
  threadUpdatedAt,
  titleGenerated,
  titleManual,
  ping,
  connectTick,
  settingsOpen,
  onToggleSettings,
  onOpenSettings,
  onPersist,
  onAutoTitle,
  onForkThread,
  onActivateThread,
  designerEmbed = false,
  designerEmbedScoped = false,
  actionDesigner,
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
  const llmSelectionRef = useRef(llmSelection);
  llmSelectionRef.current = llmSelection;
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

  const {
    messages,
    sendMessageSafe,
    setMessages,
    status,
    error,
    stop,
    clearError,
    addToolApprovalResponse,
    addToolOutput,
    repairToolCalls,
  } = useAgentChatSession({
    threadId,
    initialMessages,
    ephemeral: ephemeral === true,
    visible: visible !== false,
    workingDirectory,
    titleManual,
    designerEmbedScoped,
    actionDesigner,
    chatMode,
    enabledTools,
    llmSelection,
    onPersist,
  });

  useActionProjectImportFromMessages(messages, !ephemeral && visible);
  useReloadProgramDataFromToolMessages(messages, !ephemeral && visible);
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

  const onActivateThreadRef = useRef(onActivateThread);
  onActivateThreadRef.current = onActivateThread;

  const prevBackgroundRunStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevBackgroundRunStatusRef.current;
    prevBackgroundRunStatusRef.current = status;
    const wasBusy = prev === "streaming" || prev === "submitted";
    const isIdle = status === "ready" || status === "error";
    if (!wasBusy || !isIdle || ephemeral || visible) return;
    if (!onActivateThreadRef.current) return;

    notifyBackgroundThreadRunComplete({
      threadId,
      threadTitle,
      status,
      pendingApprovalCount,
      pendingAskQuestionCount,
      visible,
      ephemeral,
      onActivate: () => onActivateThreadRef.current?.(),
    });
  }, [
    ephemeral,
    pendingApprovalCount,
    pendingAskQuestionCount,
    status,
    threadId,
    threadTitle,
    visible,
  ]);

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

  useEffect(() => {
    setThreadRunBusy(threadId, busy);
    return () => setThreadRunBusy(threadId, false);
  }, [threadId, busy]);

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

  const insertComposerProgramStepTag = useCallback(
    (tag: ProgramStepTag) => {
      if (editAnchorMessageId) return;
      voiceInterruptRef.current();
      clearError();
      composerRef.current?.insertProgramStepTag(tag);
      requestAnimationFrame(() => composerRef.current?.focusAtEnd());
    },
    [editAnchorMessageId, clearError],
  );

  useEffect(() => {
    if (ephemeral || !visible) return;
    registerChatComposerActions(threadId, {
      insertPrompt: insertComposerPrompt,
      insertBrowserElementTag: insertComposerBrowserElementTag,
      insertProgramStepTag: insertComposerProgramStepTag,
      focusComposer: focusComposerAtEnd,
    });
    return () => {
      unregisterChatComposerActions(threadId);
    };
  }, [
    ephemeral,
    visible,
    threadId,
    focusComposerAtEnd,
    insertComposerBrowserElementTag,
    insertComposerProgramStepTag,
    insertComposerPrompt,
  ]);

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

  const agentActivity = useMemo(
    () =>
      resolveAgentActivity({
        chatStatus: status,
        messages,
        pendingApprovalCount,
        pendingAskQuestionCount,
      }),
    [status, messages, pendingApprovalCount, pendingAskQuestionCount],
  );

  const lastTurnStickyResetKey = useMemo(() => {
    if (userTurnStarts.length === 0) return threadId;
    const startIndex = userTurnStarts[userTurnStarts.length - 1]!;
    const userMessageId = messages[startIndex]?.id ?? String(startIndex);
    return `${threadId}:${userMessageId}`;
  }, [threadId, userTurnStarts, messages]);

  const lastTurnFillScrollport = useMsgTurnStickyActive(
    messagesRef,
    msgTurnRef,
    visible && userTurnStarts.length > 0,
    lastTurnStickyResetKey,
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

  const handleForkConversation = useCallback(() => {
    if (ephemeral || !onForkThread || messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    onForkThread(threadId, messages, lastMessage.id);
  }, [ephemeral, messages, onForkThread, threadId]);

  const { exporting, exportThread, exportDialog } = useChatThreadExportDialog({
    disabled: ephemeral,
  });

  const exportThreadMeta = useMemo(
    () => ({
      id: threadId,
      title: threadTitle,
      updatedAt: threadUpdatedAt,
      workingDirectory,
      titleGenerated,
      titleManual,
      ...(designerEmbedScoped && actionDesigner ? { actionDesigner } : {}),
      messages: initialMessages,
    }),
    [
      actionDesigner,
      designerEmbedScoped,
      initialMessages,
      threadId,
      threadTitle,
      threadUpdatedAt,
      titleGenerated,
      titleManual,
      workingDirectory,
    ],
  );

  const handleExportConversation = useCallback(() => {
    void exportThreadLikeWithLiveMessages(
      exportThread,
      exportThreadMeta,
      messages,
    );
  }, [exportThread, exportThreadMeta, messages]);

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
          canForkConversation={!ephemeral && !!onForkThread && messages.length > 0}
          onForkConversation={handleForkConversation}
          canExportConversation={!ephemeral && messages.length > 0}
          exportConversationDisabled={exporting}
          onExportConversation={handleExportConversation}
        />
      );
    },
    [
      agentActivity,
      beginEditFromUserMessage,
      editAnchorLiveDraft,
      editAnchorIndex,
      editAnchorMessageId,
      ephemeral,
      handleForkConversation,
      handleExportConversation,
      exporting,
      insertComposerPrompt,
      focusComposerAtEnd,
      lastTurnFillScrollport,
      lastVisibleMessageId,
      messages,
      onForkThread,
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
      className={`app-main${isEmptyThread ? " app-main--empty" : ""}${panelOpen ? " app-main--side-open" : ""}${designerEmbed ? " app-main--designer-embed" : ""}${visible ? "" : " app-main--hidden"}`}
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
        workingDirectory={workingDirectory}
        designerEmbed={designerEmbed}
      />
        </div>
        {visible ? <WorkspaceExplorerPanel /> : null}
      </div>
    </div>
    {exportDialog}
    </ChatToolActionsProvider>
  );
}

export function Chat() {
  const designerEmbed = useActionDesignerEmbed();
  const designerThreadRef = useMemo(
    () => actionDesignerRefFromEmbed(designerEmbed),
    [designerEmbed.scoped, designerEmbed.entityId, designerEmbed.isSubProgram],
  );
  const showMainChrome = !designerEmbed.enabled;
  const showDesignerDebugSidebar = designerEmbed.debugMode;
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

  const openTabHydrationKey = useMemo(() => {
    return store.openTabIds
      .map((id) => {
        const thread = store.threads.find((item) => item.id === id);
        if (!thread || thread.messages.length > 0) return null;
        return id;
      })
      .filter((id): id is string => id !== null)
      .join("\0");
  }, [store.openTabIds, store.threads]);

  useEffect(() => {
    if (!chatStoreHydrated || !openTabHydrationKey) return;
    const threadIds = openTabHydrationKey.split("\0");
    const base = getChatStoreSnapshotSync();
    let cancelled = false;
    void (async () => {
      const hydrated = await hydrateStoreThreadsParallel(base, threadIds);
      if (cancelled) return;
      const latest = getChatStoreSnapshotSync();
      let next = latest;
      for (const threadId of threadIds) {
        const thread = hydrated.threads.find((item) => item.id === threadId);
        if (!thread || thread.messages.length === 0) continue;
        next = applyThreadMessagesToStore(next, threadId, thread.messages);
      }
      if (next !== latest) {
        setHydratedOpenTabs({ source: latest, value: next });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chatStoreHydrated, openTabHydrationKey]);

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
    const collapsed = designerEmbed.debugMode
      ? false
      : loadSidebarCollapsed();
    setSidebarCollapsed(collapsed);
    applySidebarCollapsed(collapsed);
  }, [designerEmbed.debugMode]);

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

  const handleForkThread = useCallback(
    (
      threadId: string,
      messages: AgentUIMessage[],
      upToMessageId: string,
    ) => {
      const next = forkThread(
        storeRef.current,
        threadId,
        messages,
        upToMessageId,
      );
      if (next === storeRef.current) return;
      storeRef.current = next;
      updateStore(next);
    },
    [updateStore],
  );

  const handleActivateThread = useCallback(
    (threadId: string) => {
      clearThreadNeedsAttention(threadId);
      activateThreadWithLazyHydration({
        threadId,
        mode: "open",
        onStoreChange: updateStore,
        getStore: getChatStoreSnapshotSync,
      });
    },
    [updateStore],
  );

  useEffect(() => {
    let unlistenDesktop = () => {};
    const activateFromNotification = (threadId: string) => {
      if (!threadId.trim()) return;
      handleActivateThread(threadId);
    };
    const onBrowserNotificationActivate = (event: Event) => {
      const detail = (event as CustomEvent<ThreadNotificationActivateDetail>)
        .detail;
      activateFromNotification(detail?.threadId ?? "");
    };

    window.addEventListener(
      THREAD_NOTIFICATION_ACTIVATE_EVENT,
      onBrowserNotificationActivate,
    );
    void listenDesktop("thread-notification-activate", (payload) => {
      if (typeof payload !== "object" || payload === null) return;
      const threadId = (payload as { threadId?: unknown }).threadId;
      if (typeof threadId === "string") {
        activateFromNotification(threadId);
      }
    }).then((unlisten) => {
      unlistenDesktop = unlisten;
    });

    return () => {
      window.removeEventListener(
        THREAD_NOTIFICATION_ACTIVATE_EVENT,
        onBrowserNotificationActivate,
      );
      unlistenDesktop();
    };
  }, [handleActivateThread]);

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
    (thread: { workspaceId?: string; workingDirectory?: string }) =>
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
      className={`app-shell${sidebarCollapsed ? " app-shell--sidebar-collapsed" : ""}${designerEmbed.enabled ? " app-shell--designer-embed" : ""}${designerEmbed.debugMode ? " app-shell--designer-embed-debug" : ""}`}
      suppressHydrationWarning
    >
        {(showMainChrome || showDesignerDebugSidebar) ? (
          <div className="app-shell-toggle-slot">
            <SidebarToggle
              sidebarOpen={!sidebarCollapsed}
              onClick={toggleSidebar}
              className="shell-sidebar-toggle"
            />
          </div>
        ) : null}
        {(showMainChrome || showDesignerDebugSidebar) ? (
          <div className="workspace-rail" aria-hidden={sidebarCollapsed}>
            <ChatSidebar
              store={store}
              defaultCwd={defaultCwd}
              defaultCwdProfile={defaultCwdProfile}
              defaultCwdReady={defaultCwdReady}
              onChange={updateStore}
              onActivateThread={handleActivateThread}
              groupBy={designerEmbed.debugMode ? "actionDesigner" : "cwd"}
            />
          </div>
        ) : null}
        <div className="app-main-column">
          <WorkspaceExplorerPanelProvider
            cwd={activeThreadWorkingDirectory}
            cwdPending={cwdPending}
          >
            <DocsViewerProvider>
              <EmbeddedBrowserProvider>
              <EmbeddedTerminalTabsProvider>
              <EmbeddedTerminalProvider>
              <EmbeddedBrowserTabsProvider>
              {showMainChrome ? (
                <ThreadSidePanelSync activeThreadId={activeThread.id} />
              ) : null}
              {showMainChrome ? <WorkspaceMainEditorTabBridgeRegistrar /> : null}
              <ChatTitlebar
                store={storeWithOpenTabMessages}
                onChange={updateStore}
                actionDesigner={designerThreadRef}
                designerEmbed={designerEmbed.scoped}
              />
              {designerEmbed.scoped ? <DesignerEmbedContextBar /> : null}
              {designerEmbed.debugMode ? (
                <div className="designer-embed-debug-banner" role="status">
                  设计器调试模式 · 左侧列出所有 ActionDesigner 对话
                </div>
              ) : null}
              {showMainChrome ? (
                <ChatStoragePortBanner store={storeWithOpenTabMessages} />
              ) : null}
              {showMainChrome ? <ReleasePreviewBanner /> : null}
              <div className="app-content-row">
                <div className="app-main-shell">
                  <AppMainWorkspaceSplit>
                    {!chatStoreHydrated ? (
                      <AppLoadingIndicator
                        message="正在加载对话…"
                        variant="panel"
                      />
                    ) : null}
                    {chatStoreHydrated
                      && openTabThreads.map((thread) => (
                      <ChatPanel
                        key={thread.id}
                        threadId={thread.id}
                        initialMessages={thread.messages}
                        workingDirectory={resolveThreadCwd(thread)}
                        visible={thread.id === activeThread.id}
                        threadTitle={thread.title}
                        threadUpdatedAt={thread.updatedAt}
                        titleGenerated={thread.titleGenerated ?? false}
                        titleManual={thread.titleManual ?? false}
                        ping={ping}
                        connectTick={connectTick}
                        settingsOpen={settingsOpen}
                        onToggleSettings={toggleSettings}
                        onOpenSettings={openSettings}
                        onPersist={persistMessages}
                        onAutoTitle={handleAutoTitle}
                        onForkThread={handleForkThread}
                        onActivateThread={() => handleActivateThread(thread.id)}
                        designerEmbed={designerEmbed.enabled}
                        designerEmbedScoped={designerEmbed.scoped}
                        actionDesigner={
                          designerEmbed.scoped
                            ? (thread.actionDesigner ?? designerThreadRef)
                            : undefined
                        }
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
                        threadUpdatedAt={Date.now()}
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
              </EmbeddedBrowserTabsProvider>
              </EmbeddedTerminalProvider>
              </EmbeddedTerminalTabsProvider>
              </EmbeddedBrowserProvider>
            </DocsViewerProvider>
          </WorkspaceExplorerPanelProvider>
        </div>
      </div>
    </WorkspaceExplorerShellProvider>
  );
}
