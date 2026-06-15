"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ToolTestConversationCard } from "@/components/tool-test/ToolTestConversationCard";
import { ToolTestRunsPaneShell } from "@/components/tool-test/ToolTestRunsPaneShell";
import type { ToolTestConversationStatus } from "@/lib/tool-test-conversation-run";
import {
  fetchLlmOptions,
  ModelSelector,
  pickInitialLlmSelectionFromApi,
} from "@/components/chat/ModelSelector";
import type { AgentUIMessage } from "@/lib/chat-types";
import { loadStoredLlmSelectionRaw, storeLlmSelectionRaw } from "@/lib/llm-prefs";
import { cleanupToolTestChatSession, formatToolTestCleanupHint } from "@/lib/tool-test-chat-cleanup";
import {
  getDefaultPromptChatExample,
  getPromptChatExampleGroups,
  type PromptChatExample,
} from "@/lib/tool-test-prompt-chat-examples";

type ToolTestPromptChatContextValue = {
  messages: AgentUIMessage[];
  status: string;
  error: Error | undefined;
  prompt: string;
  setPrompt: (value: string) => void;
  sendPromptText: (text: string) => void;
  applyExample: (example: PromptChatExample) => void;
  llmSelection: string;
  setLlmSelection: (value: string) => void;
  sendPrompt: () => void;
  cleanupSession: () => Promise<void>;
  cleanupBusy: boolean;
  cleanupHint: string | null;
  chatBusy: boolean;
  disabled: boolean;
};

const ToolTestPromptChatContext =
  createContext<ToolTestPromptChatContextValue | null>(null);

function useToolTestPromptChatContext(): ToolTestPromptChatContextValue {
  const ctx = useContext(ToolTestPromptChatContext);
  if (!ctx) {
    throw new Error("ToolTestPromptChatContext missing");
  }
  return ctx;
}

type ToolTestPromptChatProviderProps = {
  children: ReactNode;
  workingDirectory?: string;
  disabled?: boolean;
};

export function ToolTestPromptChatProvider({
  children,
  workingDirectory,
  disabled = false,
}: ToolTestPromptChatProviderProps) {
  const [prompt, setPrompt] = useState(
    () => getDefaultPromptChatExample().text,
  );
  const [llmSelection, setLlmSelection] = useState("");
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupHint, setCleanupHint] = useState<string | null>(null);
  const llmSelectionRef = useRef(llmSelection);
  llmSelectionRef.current = llmSelection;
  const workingDirectoryRef = useRef(workingDirectory);
  workingDirectoryRef.current = workingDirectory;

  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          llmSelection: llmSelectionRef.current,
          workingDirectory: workingDirectoryRef.current?.trim() || undefined,
        }),
      }),
    [],
  );

  const {
    messages,
    sendMessage,
    setMessages,
    stop,
    status,
    error,
  } = useChat<AgentUIMessage>({
    id: "tool-test-prompt-chat",
    messages: [],
    transport: chatTransport,
    experimental_throttle: 80,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchLlmOptions();
      if (cancelled || !data) return;
      const initial = pickInitialLlmSelectionFromApi(
        data,
        loadStoredLlmSelectionRaw(),
      );
      setLlmSelection((prev) => (prev ? prev : initial));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const chatBusy =
    status === "submitted" || status === "streaming" || cleanupBusy;
  const disabledAll = disabled || chatBusy;

  const sendPromptText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !llmSelection.trim() || disabledAll) return;
      setCleanupHint(null);
      void sendMessage({ text: trimmed }).catch(() => {
        /* surfaced via useChat error */
      });
      setPrompt("");
    },
    [disabledAll, llmSelection, sendMessage],
  );

  const sendPrompt = useCallback(() => {
    sendPromptText(prompt);
  }, [prompt, sendPromptText]);

  const applyExample = useCallback((example: PromptChatExample) => {
    setPrompt(example.text);
  }, []);

  const cleanupSession = useCallback(async () => {
    if (cleanupBusy) return;
    setCleanupBusy(true);
    setCleanupHint(null);
    stop();

    try {
      const result = await cleanupToolTestChatSession({
        cwd: workingDirectoryRef.current,
        messages,
      });
      setMessages([]);

      setCleanupHint(
        formatToolTestCleanupHint(result, "已清空对话"),
      );
    } finally {
      setCleanupBusy(false);
    }
  }, [cleanupBusy, messages, setMessages, stop]);

  const value = useMemo(
    (): ToolTestPromptChatContextValue => ({
      messages,
      status,
      error,
      prompt,
      setPrompt,
      sendPromptText,
      applyExample,
      llmSelection,
      setLlmSelection: (next) => {
        setLlmSelection(next);
        storeLlmSelectionRaw(next);
      },
      sendPrompt,
      cleanupSession,
      cleanupBusy,
      cleanupHint,
      chatBusy,
      disabled: disabledAll,
    }),
    [
      messages,
      status,
      error,
      prompt,
      llmSelection,
      sendPromptText,
      applyExample,
      sendPrompt,
      cleanupSession,
      cleanupBusy,
      cleanupHint,
      chatBusy,
      disabledAll,
    ],
  );

  return (
    <ToolTestPromptChatContext.Provider value={value}>
      {children}
    </ToolTestPromptChatContext.Provider>
  );
}

export function ToolTestPromptChatSidebar({
  disabled,
}: {
  disabled?: boolean;
}) {
  const {
    prompt,
    setPrompt,
    llmSelection,
    setLlmSelection,
    sendPrompt,
    sendPromptText,
    applyExample,
    chatBusy,
    disabled: disabledAll,
    error,
  } = useToolTestPromptChatContext();

  const blocked = disabled || disabledAll;
  const exampleGroups = useMemo(() => getPromptChatExampleGroups(), []);

  return (
    <div className="tool-test-prompt-panel tool-test-prompt-panel--simple">
      <p className="tool-test-prompt-intro">
        走完整 <code>/api/chat</code> 生产路径测试 Prompt 与多轮对话。右侧可查看与主聊天相同的消息与工具行。
      </p>

      <div className="tool-test-prompt-model">
        <span className="tool-test-prompt-model__label">对话模型</span>
        <ModelSelector
          selection={llmSelection}
          disabled={blocked}
          onChange={setLlmSelection}
        />
      </div>

      <div className="tool-test-title-groups" role="group" aria-label="可选 Prompt">
        {exampleGroups.map((group) => (
          <section
            key={group.id}
            className="tool-test-title-group"
            aria-labelledby={`prompt-chat-group-${group.id}`}
          >
            <h3
              id={`prompt-chat-group-${group.id}`}
              className="tool-test-title-group__heading"
            >
              {group.label}
            </h3>
            <div className="tool-test-title-quick">
              {group.examples.map((example) => (
                <div key={example.id} className="tool-test-prompt-chat-example">
                  <button
                    type="button"
                    className="tool-test-title-quick-btn"
                    disabled={blocked || !llmSelection.trim()}
                    onClick={() => sendPromptText(example.text)}
                  >
                    <span className="tool-test-title-quick-btn__label">
                      {example.label}
                      {example.readOnly ? (
                        <span className="tool-test-prompt-chat-example__tag">
                          只读
                        </span>
                      ) : null}
                    </span>
                    <span className="tool-test-title-quick-btn__desc">
                      {example.hint}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="tool-test-prompt-chat-example__fill"
                    disabled={blocked}
                    title="填入下方编辑区"
                    onClick={() => applyExample(example)}
                  >
                    填入
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <label className="tool-test-prompt-field">
        <span className="tool-test-prompt-field__label">Prompt</span>
        <textarea
          className="tool-test-prompt-field__input tool-test-prompt-chat__textarea"
          data-testid="tool-test-prompt-input"
          rows={10}
          value={prompt}
          disabled={blocked || !llmSelection.trim()}
          spellCheck={false}
          placeholder="输入要发送给 Agent 的 prompt…"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              sendPrompt();
            }
          }}
        />
      </label>

      <button
        type="button"
        className="tool-test-suite-card__run"
        data-testid="tool-test-prompt-send"
        disabled={blocked || !prompt.trim() || !llmSelection.trim()}
        onClick={sendPrompt}
      >
        {chatBusy ? "对话中…" : "发送 Prompt"}
      </button>

      <p className="tool-test-prompt-chat__hint">
        点示例卡片直接发送 · 「填入」可改后再发 · Ctrl+Enter 发送自定义内容
      </p>

      {error ? (
        <p className="tool-test-prompt-chat__error" role="alert">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

export function ToolTestPromptChatPane({
  workingDirectory,
}: {
  workingDirectory?: string;
}) {
  const {
    messages,
    status,
    cleanupSession,
    cleanupBusy,
    cleanupHint,
    chatBusy,
  } = useToolTestPromptChatContext();
  const endRef = useRef<HTMLDivElement>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (messages.length === 0) {
      setSessionStartedAt(null);
      return;
    }
    setSessionStartedAt((prev) => prev ?? Date.now());
  }, [messages.length]);

  useEffect(() => {
    if (status !== "streaming" && status !== "submitted") return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, status, messages[messages.length - 1]?.parts.length]);

  const chatStatus: ToolTestConversationStatus =
    status === "error"
      ? "error"
      : chatBusy
        ? "running"
        : messages.length > 0
          ? "done"
          : "done";

  const subText =
    messages.length === 0
      ? "左侧输入 Prompt 开始"
      : `1 场对话 · ${messages.length} 条消息 · 生产 /api/chat`;

  const runShell =
    messages.length > 0
      ? [{ status: chatStatus, chatMessages: messages }]
      : [];

  return (
    <ToolTestRunsPaneShell
      heading="对话"
      subText={subText}
      emptyText="左侧输入 Prompt 即开始一场完整 /api/chat 对话（可连续多轮，均在同一张对话卡片内）。清理时会尝试删除对话里创建或编辑过的动作。"
      runs={runShell}
      workingDirectory={workingDirectory}
      onClearRuns={() => {}}
      clearedLabel="已清空对话"
      externalCleanup={{
        cleanupSession,
        cleanupBusy,
        cleanupHint,
        canCleanup: messages.length > 0 && !chatBusy && !cleanupBusy,
      }}
      streamAnchorRef={endRef}
    >
      {messages.length > 0 && sessionStartedAt != null ? (
        <ToolTestConversationCard
          label="Prompt 对话"
          badge={`${messages.length} 条`}
          badgeTitle="生产 /api/chat"
          status={chatStatus}
          statusLabels={{
            running: status === "submitted" ? "连接中…" : "流式中…",
          }}
          at={sessionStartedAt}
          messages={messages}
          workingDirectory={workingDirectory}
          streamTick={messages[messages.length - 1]?.parts.length ?? 0}
        />
      ) : null}
    </ToolTestRunsPaneShell>
  );
}
