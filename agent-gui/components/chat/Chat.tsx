"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
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
  loadStoredEnabledTools,
} from "@/lib/tool-registry";
import {
  applySidebarCollapsed,
  loadSidebarCollapsed,
} from "@/lib/sidebar-prefs";
import {
  getActiveThread,
  getOpenTabThreads,
  updateThreadMessages,
  updateThreadTitle,
} from "@/lib/chat-store";
import { AppSettingsMenu, type PingState } from "@/components/chat/AppSettingsMenu";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatTitlebar } from "@/components/chat/ChatTitlebar";
import { DocsViewerPanel, DocsViewerTabs } from "@/components/chat/DocsViewerTabs";
import { DocsViewerProvider, useDocsViewer } from "@/lib/docs-viewer";
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
  ModelSelector,
  pickInitialLlmProvider,
} from "./ModelSelector";
import type { LlmProviderId } from "@/lib/llm-providers";
import { loadStoredLlmProvider, storeLlmProvider } from "@/lib/llm-prefs";
import { resolveAgentActivity, isPlaceholderAssistantMessage } from "@/lib/agent-activity";
import { AgentActivityLine } from "@/components/chat/AgentActivityLine";
import { useUserMessageStickyMarkers } from "@/lib/use-user-message-sticky";
import { useAutoThreadTitle } from "@/lib/use-auto-thread-title";

const PING_FETCH_MS = 15_000;

function formatPingError(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    if (typeof d.stderr === "string" && d.stderr.trim()) {
      return d.stderr.trim();
    }
    if (typeof d.data === "string" && d.data.trim()) {
      return d.data.trim().slice(0, 120);
    }
    if (typeof d.data === "object" && d.data !== null && "error" in d.data) {
      const err = (d.data as { error: unknown }).error;
      if (typeof err === "string") return err;
    }
  }
  return fallback;
}

function formatChatError(error: Error): string {
  const message = error.message?.trim();
  if (message) {
    try {
      const parsed = JSON.parse(message) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error.trim()) {
        return parsed.error.trim();
      }
    } catch {
      /* plain text from /api/chat */
    }
    return message;
  }
  return "对话请求失败（无详细错误信息）。可打开开发者工具 Network 查看 /api/chat 响应。";
}

type ChatPanelProps = {
  threadId: string;
  initialMessages: AgentUIMessage[];
  workingDirectory: string;
  visible?: boolean;
  titleGenerated: boolean;
  titleManual: boolean;
  onPersist: (threadId: string, messages: AgentUIMessage[]) => void;
  onAutoTitle: (threadId: string, title: string) => void;
};

function ChatPanel({
  threadId,
  initialMessages,
  workingDirectory,
  visible = true,
  titleGenerated,
  titleManual,
  onPersist,
  onAutoTitle,
}: ChatPanelProps) {
  const [draftMessage, setDraftMessage] = useState("");
  const [ping, setPing] = useState<PingState>({ status: "loading" });
  const [enabledTools, setEnabledTools] = useState(defaultEnabledToolIds);
  const [llmProvider, setLlmProvider] = useState<LlmProviderId>("deepseek");
  const [connectTick, setConnectTick] = useState(0);

  useEffect(() => {
    setEnabledTools(loadStoredEnabledTools());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchLlmOptions();
      if (cancelled || !data) return;
      const initial = pickInitialLlmProvider(data, loadStoredLlmProvider());
      setLlmProvider(initial);
      storeLlmProvider(initial);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const messagesRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerMarkupFieldHandle>(null);
  const persistRef = useRef(onPersist);
  persistRef.current = onPersist;

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

  const { messages, sendMessage, status, error, stop, clearError, addToolApprovalResponse } =
    useChat<AgentUIMessage>({
      id: threadId,
      messages: initialMessages,
      transport: chatTransport,
      sendAutomaticallyWhen:
        lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      persistRef.current(threadId, messages);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [threadId, messages]);

  useAutoThreadTitle({
    threadId,
    messages,
    status,
    llmProvider,
    titleGenerated,
    titleManual,
    onTitle: onAutoTitle,
  });

  const pendingApprovalCount = useMemo(() => {
    let n = 0;
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (
          isToolOrDynamicToolUIPart(part)
          && part.state === "approval-requested"
        ) {
          n += 1;
        }
      }
    }
    return n;
  }, [messages]);

  const refreshPing = useCallback(async () => {
    setPing({ status: "loading" });
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), PING_FETCH_MS);
    try {
      const res = await fetch("/api/ping", {
        signal: controller.signal,
        cache: "no-store",
      });
      const raw = await res.text();
      let data: unknown = null;
      if (raw.trim()) {
        try {
          data = JSON.parse(raw) as unknown;
        } catch {
          setPing({ status: "error", message: "健康检查响应无效" });
          return;
        }
      }
      const ok =
        typeof data === "object" &&
        data !== null &&
        "ok" in data &&
        (data as { ok: boolean }).ok;
      if (res.ok && ok) {
        setPing({ status: "ok", data });
        setConnectTick((n) => n + 1);
        return;
      }
      setPing({
        status: "error",
        message: formatPingError(data, res.ok ? "未连接 Quicker" : `HTTP ${res.status}`),
      });
    } catch (e) {
      const message =
        e instanceof Error && e.name === "AbortError"
          ? "检测超时（请确认 pnpm dev 已启动且 qkrpc 可用）"
          : e instanceof Error
            ? e.message
            : String(e);
      setPing({ status: "error", message });
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    void refreshPing();
  }, [refreshPing]);

  // start.mjs may still be launching qkrpc serve when the page first loads
  const pingBootRetriesRef = useRef(0);
  useEffect(() => {
    if (ping.status !== "error") return;
    if (pingBootRetriesRef.current >= 2) return;
    const delayMs = pingBootRetriesRef.current === 0 ? 2_000 : 5_000;
    pingBootRetriesRef.current += 1;
    const timer = window.setTimeout(() => void refreshPing(), delayMs);
    return () => window.clearTimeout(timer);
  }, [ping.status, refreshPing]);

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const container = messagesRef.current;
    const el = messagesEndRef.current;
    if (!container || !el) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom > 120) return;

    const frame = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: busy ? "auto" : "smooth", block: "end" });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, error, status, busy]);

  useUserMessageStickyMarkers(messagesRef, visible, messages);

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

  const submitComposer = useCallback(() => {
    if (busy) return;
    const text = draftMessage.trim();
    if (!canSendComposedMessage(text)) return;
    sendMessage({ text });
    setDraftMessage("");
  }, [busy, draftMessage, sendMessage]);

  const qkrpcOk = ping.status === "ok";
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
  const { activeTabId } = useDocsViewer();
  const showDocView = activeTabId != null;

  return (
    <div
      className={`app-main${isEmptyThread ? " app-main--empty" : ""}${showDocView ? " app-main--doc-view" : ""}${visible ? "" : " app-main--hidden"}`}
      aria-hidden={visible ? undefined : true}
    >
      <DocsViewerTabs />
      {showDocView ? (
        <DocsViewerPanel />
      ) : (
      <div className="messages-view">
      <main
        ref={messagesRef}
        className={`messages${agentActivity ? " messages--agent-busy" : ""}`}
      >
        {messages.map((message) => {
          const lastMessage = messages[messages.length - 1];
          if (
            agentActivity
            && message.id === lastMessage?.id
            && isPlaceholderAssistantMessage(message)
          ) {
            return null;
          }

          return (
            <article
              key={message.id}
              className={`msg msg--${message.role === "user" ? "user" : "assistant"}${message.id === lastVisibleMessageId && !agentActivity ? " msg--last" : ""}`}
            >
              <div className="msg-content">
                <div className="parts">
                  <MessageParts
                    message={message}
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
      )}

      {pendingApprovalCount > 0 && (
        <div className="approval-hint" role="status">
          {pendingApprovalCount} 个操作待确认 — 在上方工具卡片点击「确认执行」或「取消」
        </div>
      )}

      <footer className="composer">
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
              placeholder="描述你想在 Quicker 里做的事…（@ 引用动作）"
              disabled={busy}
              qkrpcOk={qkrpcOk}
              onChange={setDraftMessage}
              onSubmit={submitComposer}
            />
            <div className="composer-toolbar">
              <div className="composer-toolbar-left">
                <AppSettingsMenu
                  ping={ping}
                  onRefreshPing={refreshPing}
                  disabled={busy}
                />
                <ActionTagSelector
                  ping={ping}
                  refreshKey={connectTick}
                  tagCount={draftTagCount}
                  embeddedTagIds={draftTagIds}
                  onSelect={insertDraftActionTag}
                  disabled={busy}
                />
                <ToolSelector
                  enabledTools={enabledTools}
                  onChange={setEnabledTools}
                  disabled={busy}
                />
                <ModelSelector
                  providerId={llmProvider}
                  onChange={(id) => {
                    setLlmProvider(id);
                    storeLlmProvider(id);
                  }}
                  disabled={busy}
                />
                <span className="composer-hint">Shift+Enter 换行</span>
              </div>
              <div className="composer-toolbar-actions">
                {!isEmptyThread && (
                  <ContextUsage
                    messages={messages}
                    busy={busy}
                    providerId={llmProvider}
                  />
                )}
                {busy ? (
                  <button
                    type="button"
                    className="composer-btn composer-btn--stop"
                    onClick={() => stop()}
                    aria-label="停止生成"
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
                ) : (
                  <button
                    type="submit"
                    className="composer-btn composer-btn--send"
                    disabled={!canSend}
                    aria-label="发送"
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
                )}
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

  const activeThread = getActiveThread(store);
  const workingDirectory = store.workingDirectory.trim() || defaultCwd;

  return (
    <div
      className={`app-shell${sidebarCollapsed ? " app-shell--sidebar-collapsed" : ""}`}
      suppressHydrationWarning
    >
      <ChatTitlebar
        store={store}
        sidebarOpen={!sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        onChange={updateStore}
      />
      <div className="app-body">
        <ChatSidebar
          store={store}
          defaultCwd={defaultCwd}
          defaultCwdProfile={defaultCwdProfile}
          onChange={updateStore}
          collapsed={sidebarCollapsed}
        />
        <DocsViewerProvider>
          <div className="app-main-stack">
            {getOpenTabThreads(store).map((thread) => (
              <ChatPanel
                key={thread.id}
                threadId={thread.id}
                initialMessages={thread.messages}
                workingDirectory={workingDirectory}
                visible={thread.id === activeThread.id}
                titleGenerated={thread.titleGenerated ?? false}
                titleManual={thread.titleManual ?? false}
                onPersist={persistMessages}
                onAutoTitle={handleAutoTitle}
              />
            ))}
          </div>
        </DocsViewerProvider>
      </div>
    </div>
  );
}
