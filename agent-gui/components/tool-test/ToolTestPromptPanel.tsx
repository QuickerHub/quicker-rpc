"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchLlmOptions,
  ModelSelector,
  pickInitialLlmSelectionFromApi,
} from "@/components/chat/ModelSelector";
import type { AgentUIMessage } from "@/lib/chat-types";
import { loadStoredLlmSelectionRaw, storeLlmSelectionRaw } from "@/lib/llm-prefs";
import { buildTitleTestResultFromChatMessages } from "@/lib/tool-test-title-chat";
import { resolveLlmSelectionLabel } from "@/lib/tool-test-title-model-label";
import {
  createTitleTestRunId,
  type TitleTestRunEntry,
} from "@/lib/tool-test-title-runs";
import {
  getDefaultTitleTestExample,
  TITLE_TEST_EXAMPLE_GROUPS,
  type TitleTestExample,
} from "@/lib/tool-test-title-examples";
import {
  buildTitleTestMessages,
  buildTitleTestUserPayload,
  localReferenceTitle,
} from "@/lib/tool-test-title";
import { extractThreadTitleFromMessages } from "@/lib/thread-title-tool-messages";
import type { LlmOptionsResponse } from "@/lib/llm-options-shared";

type ToolTestPromptPanelProps = {
  disabled?: boolean;
  workingDirectory?: string;
  onAppendRun: (entry: TitleTestRunEntry) => void;
  onPatchRun: (id: string, patch: Partial<TitleTestRunEntry>) => void;
};

function buildRunSnapshot(
  example: TitleTestExample,
  llmSelection: string,
  llmModelLabel: string,
  requestPayload: string,
): TitleTestRunEntry {
  const userText = example.userText;
  const assistantText = example.assistantText ?? "";
  const messages = buildTitleTestMessages(userText, assistantText);
  return {
    id: createTitleTestRunId(),
    at: Date.now(),
    triggerLabel: example.label,
    userText,
    assistantText,
    requestPayload,
    localReference: localReferenceTitle(messages),
    llmSelection,
    llmModelLabel,
    status: "running",
    chatMessages: [],
  };
}

export function ToolTestPromptPanel({
  disabled,
  workingDirectory,
  onAppendRun,
  onPatchRun,
}: ToolTestPromptPanelProps) {
  const [running, setRunning] = useState(false);
  const [customUser, setCustomUser] = useState(
    () => getDefaultTitleTestExample().userText,
  );
  const [llmOptions, setLlmOptions] = useState<LlmOptionsResponse | null>(null);
  const [llmSelection, setLlmSelection] = useState("");
  const activeRunIdRef = useRef<string | null>(null);
  const titleCapturedRef = useRef(false);
  const streamStartedRef = useRef(false);
  const llmSelectionRef = useRef(llmSelection);
  llmSelectionRef.current = llmSelection;
  const workingDirectoryRef = useRef(workingDirectory);
  workingDirectoryRef.current = workingDirectory;

  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          titleTestOnly: true,
          llmSelection: llmSelectionRef.current,
          llmProvider: llmSelectionRef.current,
          workingDirectory: workingDirectoryRef.current?.trim() || undefined,
        }),
      }),
    [],
  );

  const {
    messages: chatMessages,
    sendMessage,
    setMessages,
    stop,
    status,
    error,
  } = useChat<AgentUIMessage>({
    id: "tool-test-title-chat",
    messages: [],
    transport: chatTransport,
    experimental_throttle: 80,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchLlmOptions();
      if (cancelled) return;
      setLlmOptions(data);
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

  const llmModelLabel = resolveLlmSelectionLabel(llmSelection, llmOptions);

  const finishRun = useCallback(
    (
      runId: string,
      result: ReturnType<typeof buildTitleTestResultFromChatMessages>,
      messages: AgentUIMessage[],
    ) => {
      onPatchRun(runId, {
        status: result.error ? "error" : "done",
        result,
        chatMessages: messages,
      });
      setRunning(false);
      activeRunIdRef.current = null;
    },
    [onPatchRun],
  );

  useEffect(() => {
    const runId = activeRunIdRef.current;
    if (!runId || !running) return;
    onPatchRun(runId, { chatMessages: chatMessages });
  }, [chatMessages, running, onPatchRun]);

  useEffect(() => {
    const runId = activeRunIdRef.current;
    if (!runId || !running) return;

    const title = extractThreadTitleFromMessages(chatMessages);
    if (title && !titleCapturedRef.current) {
      titleCapturedRef.current = true;
      stop();
      finishRun(
        runId,
        buildTitleTestResultFromChatMessages(chatMessages, { aborted: true }),
        chatMessages,
      );
      return;
    }

    if (
      status === "ready"
      && !titleCapturedRef.current
      && (streamStartedRef.current || error)
    ) {
      finishRun(
        runId,
        buildTitleTestResultFromChatMessages(chatMessages, {
          error: error?.message,
        }),
        chatMessages,
      );
    }
  }, [chatMessages, status, error, running, stop, finishRun]);

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      streamStartedRef.current = true;
    }
  }, [status]);

  const startChatTitleTest = useCallback(
    (example: TitleTestExample) => {
      const payload = buildTitleTestUserPayload(
        example.userText,
        example.assistantText,
      );
      if (!payload || !llmSelection.trim()) return;

      const entry = buildRunSnapshot(
        example,
        llmSelection,
        llmModelLabel,
        payload,
      );
      onAppendRun(entry);
      stop();
      setMessages([]);
      streamStartedRef.current = false;
      titleCapturedRef.current = false;
      activeRunIdRef.current = entry.id;
      setRunning(true);

      void sendMessage({ text: payload }).catch((e) => {
        const runId = activeRunIdRef.current;
        if (!runId) return;
        finishRun(
          runId,
          buildTitleTestResultFromChatMessages([], {
            error: e instanceof Error ? e.message : String(e),
          }),
          [],
        );
      });
    },
    [llmModelLabel, llmSelection, onAppendRun, setMessages, sendMessage, stop, finishRun],
  );

  const runCustom = useCallback(() => {
    startChatTitleTest({
      id: "custom",
      label: "自定义",
      description: "",
      userText: customUser,
    });
  }, [customUser, startChatTitleTest]);

  return (
    <div className="tool-test-prompt-panel tool-test-prompt-panel--simple">
      <p className="tool-test-prompt-intro">
        走<strong>生产路径</strong>：首次用户话 → <code>/api/chat</code> 流式 → Agent 调隐藏工具{" "}
        <code>set_thread_title</code> → 拿到标题后<strong>立即中止</strong>对话。右侧可看 token。
      </p>

      <div className="tool-test-prompt-model">
        <span className="tool-test-prompt-model__label">对话模型</span>
        <ModelSelector
          selection={llmSelection}
          disabled={disabled || running}
          onChange={(next) => {
            setLlmSelection(next);
            storeLlmSelectionRaw(next);
          }}
        />
      </div>

      <div className="tool-test-title-groups" role="group" aria-label="标题测试情景">
        {TITLE_TEST_EXAMPLE_GROUPS.map((group) => (
          <section
            key={group.id}
            className="tool-test-title-group"
            aria-labelledby={`title-test-group-${group.id}`}
          >
            <h3
              id={`title-test-group-${group.id}`}
              className="tool-test-title-group__heading"
            >
              {group.label}
            </h3>
            <div className="tool-test-title-quick">
              {group.examples.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  className="tool-test-title-quick-btn"
                  disabled={disabled || running || !llmSelection.trim()}
                  onClick={() => startChatTitleTest(example)}
                >
                  <span className="tool-test-title-quick-btn__label">
                    {example.label}
                  </span>
                  <span className="tool-test-title-quick-btn__desc">
                    {example.description}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {running ? (
        <p className="tool-test-prompt-busy" aria-live="polite">
          流式对话中，等待 set_thread_title…
        </p>
      ) : null}

      <details className="tool-test-prompt-advanced">
        <summary>自定义一句用户话</summary>
        <label className="tool-test-prompt-field">
          <textarea
            className="tool-test-prompt-field__input"
            rows={3}
            value={customUser}
            disabled={disabled || running}
            spellCheck={false}
            placeholder="例如：帮我做一个剪贴板去重动作"
            onChange={(e) => setCustomUser(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="tool-test-suite-card__run"
          disabled={disabled || running || !customUser.trim() || !llmSelection.trim()}
          onClick={runCustom}
        >
          用这句话测试
        </button>
      </details>
    </div>
  );
}
