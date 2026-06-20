"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChatToolActionsProvider } from "@/lib/chat-tool-actions";
import { collectPendingAskQuestions } from "@/lib/ask-question-tool";
import { AskQuestionDock } from "@/components/chat/AskQuestionDock";
import { collectPendingApprovals } from "@/lib/collect-pending-approvals";
import { ApprovalDock } from "@/components/chat/ApprovalDock";
import { extractApprovalTargetId } from "@/lib/tool-approval-display";
import {
  findWorkspaceProjectsInTree,
  findWorkspaceSubProgramsInTree,
  type WorkspaceDeleteProjectHit,
} from "@/lib/workspace-action-project-lookup";
import { fetchActionExplorerTree } from "@/lib/workspace-explorer-api";
import {
  ChatComposerFooter,
  type ChatComposerFooterHandle,
} from "@/components/chat/ChatComposerFooter";
import { ChatMessageArticle } from "@/components/chat/ChatMessageArticle";
import { AgentActivityLine } from "@/components/chat/AgentActivityLine";
import { canSendComposedMessage } from "@/lib/compose-user-message";
import type { AgentUIMessage } from "@/lib/chat-types";
import { formatChatError } from "@/lib/chat-error-format";
import {
  isPlaceholderAssistantMessage,
  resolveAgentActivity,
} from "@/lib/agent-activity";
import { useComposerMessageQueue } from "@/lib/use-composer-message-queue";
import { useQkrpcPing } from "@/lib/use-qkrpc-ping";
import { useDevExperienceEnabled } from "@/lib/release-preview.client";
import { isTauriDevShell } from "@/lib/desktop-shell";
import { resolveUserMessageDisplayText } from "@/lib/user-message-edit";
import { useBenchChat } from "./BenchChatProvider";

export function BenchChatPanel() {
  const {
    messages,
    viewingHistory,
    benchWorkspace,
    status,
    error,
    stop,
    clearError,
    addToolApprovalResponse,
    addToolOutput,
    repairToolCalls,
    sendMessageSafe,
    chatBusy,
    chatMode,
    enabledTools,
    llmSelection,
    setLlmSelection,
    runTask,
    disabled,
  } = useBenchChat();

  const devExperienceEnabled = useDevExperienceEnabled();
  const { ping, connectTick } = useQkrpcPing(
    isTauriDevShell() ? { pollIntervalMs: 45_000 } : undefined,
  );

  const composerRef = useRef<ChatComposerFooterHandle>(null);
  const messagesRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const voiceInterruptRef = useRef<() => void>(() => {});

  const busy = chatBusy;
  const workingDirectory = benchWorkspace ?? "";

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

  const pendingApprovals = useMemo(
    () => (viewingHistory ? [] : collectPendingApprovals(messages)),
    [messages, viewingHistory],
  );
  const pendingAskQuestions = useMemo(
    () => (viewingHistory ? [] : collectPendingAskQuestions(messages)),
    [messages, viewingHistory],
  );
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

  const agentActivity = useMemo(
    () =>
      viewingHistory
        ? null
        : resolveAgentActivity({
            chatStatus: status,
            messages,
            pendingApprovalCount: pendingApprovals.length,
            pendingAskQuestionCount: pendingAskQuestions.length,
          }),
    [
      messages,
      pendingApprovals.length,
      pendingAskQuestions.length,
      status,
      viewingHistory,
    ],
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
    messagesEndRef.current?.scrollIntoView({ behavior: busy ? "auto" : "smooth" });
  }, [messages, busy, messages[messages.length - 1]?.parts.length]);

  const focusComposerAtEnd = useCallback(() => {
    composerRef.current?.focusAtEnd();
  }, []);

  const readComposerText = useCallback(() => {
    return (composerRef.current?.getValue() ?? "").trim();
  }, []);

  const pinToStream = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, []);

  const submitComposer = useCallback(() => {
    if (viewingHistory) return;
    voiceInterruptRef.current();
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
    enqueueOrSend,
    pinToStream,
    busy,
    queueLength,
    flushNextQueuedNow,
    viewingHistory,
  ]);

  const sendTestPrompt = useCallback(
    (text: string) => {
      if (viewingHistory) return;
      if (!canSendComposedMessage(text)) return;
      voiceInterruptRef.current();
      composerRef.current?.clear();
      clearError();
      pinToStream();
      enqueueOrSend(text);
      requestAnimationFrame(() => composerRef.current?.focus());
    },
    [enqueueOrSend, pinToStream, clearError, viewingHistory],
  );

  const insertComposerPrompt = useCallback(
    (text: string) => {
      const next = text.trim();
      if (!next) return;
      voiceInterruptRef.current();
      clearError();
      composerRef.current?.setValue(next);
    },
    [clearError],
  );

  const handleComposerStop = useCallback(() => {
    clearQueue();
    interruptAgentRun();
  }, [clearQueue, interruptAgentRun]);

  const respondToAllPendingApprovals = useCallback(
    (approved: boolean, options?: { deleteWorkspace?: boolean }) => {
      for (const approval of pendingApprovals) {
        addToolApprovalResponse({
          id: approval.id,
          approved,
          reason: approved ? "用户点击批量确认" : "用户批量取消",
        });
      }
      if (approved && options?.deleteWorkspace && workingDirectory.trim()) {
        /* bench cleanup handled separately */
      }
    },
    [addToolApprovalResponse, pendingApprovals, workingDirectory],
  );

  const renderChatMessage = useCallback(
    (message: AgentUIMessage, messageIndex: number) => {
      const lastMessage = messages[messages.length - 1];
      if (
        agentActivity
        && message.id === lastMessage?.id
        && isPlaceholderAssistantMessage(message)
      ) {
        return null;
      }

      const isLastMessage =
        message.id === lastVisibleMessageId && !agentActivity;

      return (
        <ChatMessageArticle
          key={message.id}
          message={message}
          messageIndex={messageIndex}
          stickyPrompt={false}
          isEditAnchor={false}
          isAfterEditAnchor={false}
          hasLocalDraft={false}
          userEditable={false}
          isLastMessage={isLastMessage}
          isColdMessage={!isLastMessage}
          agentActivity={!!agentActivity}
          workingDirectory={workingDirectory}
          userMessageDisplayText={
            message.role === "user"
              ? resolveUserMessageDisplayText(message, {})
              : ""
          }
          onBeginEdit={() => {}}
          onFocusComposerAtEnd={focusComposerAtEnd}
          onInsertComposerPrompt={insertComposerPrompt}
          canForkConversation={false}
          canExportConversation={false}
        />
      );
    },
    [
      agentActivity,
      focusComposerAtEnd,
      insertComposerPrompt,
      lastVisibleMessageId,
      messages,
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

  const composerDisabled = viewingHistory || disabled;

  return (
    <ChatToolActionsProvider addToolOutput={addToolOutput}>
      <div
        className={`app-main${isEmptyThread ? " app-main--empty" : ""} bench-chat-panel`}
      >
        <div className="app-main-body">
          <div className="app-main-chat-column">
            <div className="messages-view">
              <main
                ref={messagesRef}
                className={`messages${agentActivity ? " messages--agent-busy" : ""}`}
              >
                {isEmptyThread ? (
                  <div className="bench-empty-state">
                    <h2 className="bench-empty-state__title">QuickerBench</h2>
                    <p className="bench-empty-state__desc">
                      从左侧选择评测任务。每次运行使用隔离空工作区；完成后自动 Mock 断言与导出。
                    </p>
                  </div>
                ) : (
                  messages.map((message, index) => renderChatMessage(message, index))
                )}
                {agentActivityBlock}
                {errorBanner}
                <div ref={messagesEndRef} className="messages-anchor" aria-hidden />
              </main>
            </div>

            {!viewingHistory && pendingApprovals.length > 0 ? (
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
            ) : null}

            {!viewingHistory && activePendingAskQuestion ? (
              <AskQuestionDock
                pending={activePendingAskQuestion}
                disabled={busy}
              />
            ) : null}

            <div className={`bench-composer-wrap${composerDisabled ? " bench-composer-wrap--disabled" : ""}`}>
            <ChatComposerFooter
              ref={composerRef}
              visible
              ephemeral
              editAnchorMessageId={null}
              isEmptyThread={isEmptyThread}
              busy={busy}
              queueLength={queueLength}
              queuedMessages={queuedMessages}
              onRemoveFromQueue={removeFromQueue}
              settingsOpen={false}
              messages={messages}
              ping={ping}
              connectTick={connectTick}
              devExperienceEnabled={devExperienceEnabled}
              chatMode={chatMode}
              enabledTools={enabledTools}
              llmSelection={llmSelection}
              onChatModeChange={() => {}}
              onEnabledToolsChange={() => {}}
              onLlmSelectionChange={setLlmSelection}
              onToggleSettings={() => {}}
              onOpenSettings={() => {}}
              onSubmit={submitComposer}
              onSendTestPrompt={sendTestPrompt}
              onStop={handleComposerStop}
              onExitEdit={() => {}}
              onEditAnchorDraftChange={() => {}}
              voiceInterruptRef={voiceInterruptRef}
              workingDirectory={workingDirectory}
              designerEmbed={false}
              showContextUsage
            />
            </div>
          </div>
        </div>
      </div>
    </ChatToolActionsProvider>
  );
}
