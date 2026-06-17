"use client";

import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, generateId } from "ai";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isTextUIPart } from "ai";
import { AgentActivityLine } from "@/components/chat/AgentActivityLine";
import { ChatMessageArticle } from "@/components/chat/ChatMessageArticle";
import {
  CursorSdkComposer,
  type CursorSdkComposerHandle,
} from "@/components/cursor-sdk/CursorSdkComposer";
import { CursorSdkTitlebar } from "@/components/cursor-sdk/CursorSdkTitlebar";
import type { CursorSdkModelOption } from "@/lib/cursor-sdk/model-options";
import { mergeCursorSdkModelOptions } from "@/lib/cursor-sdk/model-options";
import { resolveAgentActivity } from "@/lib/agent-activity";
import type { AgentUIMessage } from "@/lib/chat-types";
import { ChatToolActionsProvider } from "@/lib/chat-tool-actions";
import {
  clearStoredCursorSdkSessionId,
  loadStoredCursorSdkModel,
  loadStoredCursorSdkSessionId,
  storeCursorSdkModel,
  storeCursorSdkSessionId,
} from "@/lib/cursor-sdk/prefs";
import { useQkrpcPing } from "@/lib/use-qkrpc-ping";
import { useChatStore } from "@/lib/use-chat-store";

type CursorSdkStatus = {
  configured: boolean;
  defaultModel: string;
  builtinModels: CursorSdkModelOption[];
  remoteModels?: CursorSdkModelOption[];
  workingDirectory: string;
  qkrpcExe: string | null;
  qkrpcError: string | null;
  activeSessions: number;
};

type CursorSdkPageProps = {
  initialCwd?: string;
};

function ensureSessionId(): string {
  const stored = loadStoredCursorSdkSessionId();
  if (stored) return stored;
  const created = generateId();
  storeCursorSdkSessionId(created);
  return created;
}

function formatCursorSdkChatError(error: Error): string {
  const message = error.message?.trim();
  if (!message) {
    return "Cursor SDK 请求失败。请检查 CURSOR_API_KEY 与 dev server 日志。";
  }
  try {
    const parsed = JSON.parse(message) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
  } catch {
    /* plain text */
  }
  return message.replace(/\/api\/chat/g, "/api/cursor-sdk/chat");
}

function userMessageDisplayText(message: AgentUIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
}

export function CursorSdkPage({ initialCwd }: CursorSdkPageProps) {
  const { store, defaultCwd } = useChatStore();
  const workingDirectory =
    initialCwd?.trim()
    || store.workingDirectory.trim()
    || defaultCwd.trim();
  const { ping, refreshPing } = useQkrpcPing();
  const composerRef = useRef<CursorSdkComposerHandle>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<CursorSdkStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [modelId, setModelId] = useState(
    () => loadStoredCursorSdkModel() ?? "auto",
  );
  const [sessionId, setSessionId] = useState(() => ensureSessionId());
  const [resetBusy, setResetBusy] = useState(false);

  const sessionIdRef = useRef(sessionId);
  const modelIdRef = useRef(modelId);
  const workingDirectoryRef = useRef(workingDirectory);
  const newSessionRef = useRef(false);
  sessionIdRef.current = sessionId;
  modelIdRef.current = modelId;
  workingDirectoryRef.current = workingDirectory;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/cursor-sdk/status", { cache: "no-store" });
        const data = (await res.json()) as CursorSdkStatus & { error?: string };
        if (!res.ok) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) {
          setStatus(data);
          setStatusError(null);
          if (!loadStoredCursorSdkModel() && data.defaultModel) {
            setModelId(data.defaultModel);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setStatusError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/cursor-sdk/chat",
        body: () => ({
          sessionId: sessionIdRef.current,
          workingDirectory: workingDirectoryRef.current || undefined,
          model: modelIdRef.current,
          newSession: newSessionRef.current,
        }),
      }),
    [],
  );

  const {
    messages,
    sendMessage,
    setMessages,
    stop,
    status: chatStatus,
    error: chatError,
    clearError,
    addToolOutput,
  } = useChat<AgentUIMessage>({
    id: `cursor-sdk-${sessionId}`,
    messages: [],
    transport: chatTransport,
    experimental_throttle: 100,
  });

  const busy =
    chatStatus === "submitted" || chatStatus === "streaming" || resetBusy;
  const isEmptyThread = messages.length === 0;

  const modelOptions = useMemo((): CursorSdkModelOption[] => {
    return mergeCursorSdkModelOptions(
      status?.builtinModels ?? [{ id: "auto", label: "Auto" }],
      status?.remoteModels,
    );
  }, [status]);

  const submitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy || !status?.configured) return;
      void sendMessage({ text: trimmed }).finally(() => {
        newSessionRef.current = false;
      });
    },
    [busy, sendMessage, status?.configured],
  );

  const resetSession = useCallback(async () => {
    if (resetBusy) return;
    setResetBusy(true);
    stop();
    try {
      await fetch("/api/cursor-sdk/session", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      /* best effort */
    }
    const nextSessionId = generateId();
    clearStoredCursorSdkSessionId();
    storeCursorSdkSessionId(nextSessionId);
    newSessionRef.current = true;
    setSessionId(nextSessionId);
    setMessages([]);
    composerRef.current?.clear();
    setResetBusy(false);
  }, [resetBusy, sessionId, setMessages, stop]);

  const agentActivity = useMemo(
    () =>
      resolveAgentActivity({
        chatStatus,
        messages,
        pendingApprovalCount: 0,
        pendingAskQuestionCount: 0,
      }),
    [chatStatus, messages],
  );

  const lastMessageId = messages[messages.length - 1]?.id;

  useEffect(() => {
    if (chatStatus !== "streaming" && chatStatus !== "submitted") return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatStatus, messages[messages.length - 1]?.parts.length]);

  const banners = (
    <>
      {status === null && !statusError ? (
        <p className="cursor-sdk-banner" role="status">
          正在检查 Cursor SDK 与 qkrpc…
        </p>
      ) : status && !status.configured ? (
        <p className="cursor-sdk-banner cursor-sdk-banner--warn" role="status">
          未配置 <code>CURSOR_API_KEY</code>。在启动 dev server 的终端设置环境变量后刷新。
          {" "}
          <a
            href="https://cursor.com/dashboard/integrations"
            target="_blank"
            rel="noreferrer"
          >
            Dashboard → Integrations
          </a>
        </p>
      ) : null}
      {status?.qkrpcError ? (
        <p className="cursor-sdk-banner cursor-sdk-banner--warn" role="status">
          qkrpc: {status.qkrpcError}
        </p>
      ) : null}
      {statusError ? (
        <p className="cursor-sdk-banner cursor-sdk-banner--error" role="alert">
          {statusError}
        </p>
      ) : null}
    </>
  );

  return (
    <div className="app-shell app-shell--sidebar-collapsed cursor-sdk-shell">
      <div className="app-main-column">
        <CursorSdkTitlebar
          workingDirectory={workingDirectory}
          ping={ping}
          onRefreshPing={() => void refreshPing()}
        />
        {banners}
        <div className="app-content-row">
          <div className="app-main-shell">
            <ChatToolActionsProvider addToolOutput={addToolOutput}>
              <div
                className={`app-main${isEmptyThread ? " app-main--empty" : ""}`}
              >
                <div className="app-main-body">
                  <div className="app-main-chat-column">
                    <div className="messages-view">
                      <main
                        className={`messages${
                          agentActivity ? " messages--agent-busy" : ""
                        }`}
                      >
                        {isEmptyThread ? (
                          <div className="messages-empty cursor-sdk-messages-empty">
                            <p className="cursor-sdk-messages-empty__title">
                              Cursor SDK 编写对话
                            </p>
                            <p className="cursor-sdk-messages-empty__hint">
                              通过 <code>@cursor/sdk</code> + qkrpc MCP
                              搜索、修改动作。体验与主聊天一致：下方输入，Enter 发送。
                            </p>
                            <p className="cursor-sdk-messages-empty__hint">
                              返回{" "}
                              <Link href="/" className="cursor-sdk-inline-link">
                                主聊天
                              </Link>
                              {" "}
                              可继续使用 QuickerAgent 产品栈。
                            </p>
                          </div>
                        ) : (
                          <div className="msg-turn msg-turn--hot">
                            {messages.map((message, messageIndex) => (
                              <ChatMessageArticle
                                key={message.id}
                                message={message}
                                messageIndex={messageIndex}
                                stickyPrompt={false}
                                isEditAnchor={false}
                                isAfterEditAnchor={false}
                                hasLocalDraft={false}
                                userEditable={false}
                                isLastMessage={
                                  message.id === lastMessageId && !agentActivity
                                }
                                isColdMessage={message.id !== lastMessageId}
                                agentActivity={!!agentActivity}
                                workingDirectory={workingDirectory}
                                userMessageDisplayText={
                                  message.role === "user"
                                    ? userMessageDisplayText(message)
                                    : ""
                                }
                                onBeginEdit={() => {}}
                                onFocusComposerAtEnd={() =>
                                  composerRef.current?.focusAtEnd()
                                }
                                onInsertComposerPrompt={(text) =>
                                  composerRef.current?.insertPlainText(text)
                                }
                              />
                            ))}
                            {agentActivity ? (
                              <article
                                className="msg msg--assistant msg--activity msg--last"
                                aria-busy="true"
                              >
                                <div className="msg-content">
                                  <AgentActivityLine activity={agentActivity} />
                                </div>
                              </article>
                            ) : null}
                            {chatError ? (
                              <div className="error-banner" role="alert">
                                <span>
                                  {formatCursorSdkChatError(chatError)}
                                </span>
                                <button
                                  type="button"
                                  className="error-banner-dismiss"
                                  onClick={() => clearError()}
                                  aria-label="关闭错误提示"
                                >
                                  ×
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}
                        <div
                          ref={messagesEndRef}
                          className="messages-anchor"
                          aria-hidden
                        />
                      </main>
                    </div>
                    <CursorSdkComposer
                      ref={composerRef}
                      isEmptyThread={isEmptyThread}
                      busy={busy}
                      configured={status?.configured ?? false}
                      statusLoaded={status !== null}
                      modelId={modelId}
                      modelOptions={modelOptions}
                      workingDirectory={workingDirectory}
                      newSessionBusy={resetBusy}
                      onModelChange={(next) => {
                        if (next === modelId) return;
                        setModelId(next);
                        storeCursorSdkModel(next);
                        newSessionRef.current = true;
                      }}
                      onSubmit={submitText}
                      onStop={stop}
                      onNewSession={() => void resetSession()}
                    />
                  </div>
                </div>
              </div>
            </ChatToolActionsProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
