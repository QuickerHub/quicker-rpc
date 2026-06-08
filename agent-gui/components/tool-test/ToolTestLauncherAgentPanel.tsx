"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  fetchLlmOptions,
  ModelSelector,
  pickInitialLlmSelectionFromApi,
} from "@/components/chat/ModelSelector";
import type { LlmOptionsResponse } from "@/lib/llm-options-shared";
import { CHAT_MODE_LAUNCHER } from "@/lib/chat-mode";
import {
  loadLauncherLlmSelectionRaw,
  storeLauncherLlmSelectionRaw,
} from "@/lib/launcher/launcher-llm-prefs";
import { LLM_AUTO_SELECTION } from "@/lib/llm-selection";
import { resolveLlmSelectionLabel } from "@/lib/tool-test-title-model-label";
import {
  getDefaultLauncherAgentScenario,
  getLauncherAgentScenario,
  LAUNCHER_AGENT_SCENARIOS,
} from "@/lib/tool-test-launcher-scenarios";
import type { ChatAddToolOutput } from "@/lib/chat-tool-actions";
import {
  createLauncherAgentRunId,
  type LauncherAgentRunEntry,
} from "@/lib/tool-test-launcher-agent-runs";
import {
  findFirstExecutionToolName,
  hasAssistantResponseStarted,
} from "@/lib/tool-test-launcher-agent-timing";

type ToolTestLauncherAgentPanelProps = {
  disabled?: boolean;
  workingDirectory?: string;
  onAppendRun: (entry: LauncherAgentRunEntry) => void;
  onPatchRun: (id: string, patch: Partial<LauncherAgentRunEntry>) => void;
  onChatActionsReady?: (actions: { addToolOutput: ChatAddToolOutput } | null) => void;
};

export function ToolTestLauncherAgentPanel({
  disabled,
  workingDirectory,
  onAppendRun,
  onPatchRun,
  onChatActionsReady,
}: ToolTestLauncherAgentPanelProps) {
  const [running, setRunning] = useState(false);
  const [scenarioId, setScenarioId] = useState(
    () => getDefaultLauncherAgentScenario().id,
  );
  const [prompt, setPrompt] = useState(
    () => getDefaultLauncherAgentScenario().userPrompt,
  );
  const [llmOptions, setLlmOptions] = useState<LlmOptionsResponse | null>(null);
  const [llmSelection, setLlmSelection] = useState(
    () => loadLauncherLlmSelectionRaw() ?? LLM_AUTO_SELECTION,
  );
  const llmSelectionRef = useRef(llmSelection);
  llmSelectionRef.current = llmSelection;

  const activeRunIdRef = useRef<string | null>(null);
  const streamStartedRef = useRef(false);
  const lastPatchedMessagesKeyRef = useRef("");
  const responseStartedAtRef = useRef<number | undefined>(undefined);
  const responseCompletedAtRef = useRef<number | undefined>(undefined);
  const responseCompletionKindRef = useRef<
    LauncherAgentRunEntry["responseCompletionKind"]
  >(undefined);
  const executionToolRef = useRef<string | undefined>(undefined);
  const workingDirectoryRef = useRef(workingDirectory);
  workingDirectoryRef.current = workingDirectory;

  useEffect(() => {
    const scenario = getLauncherAgentScenario(scenarioId);
    if (scenario) setPrompt(scenario.userPrompt);
  }, [scenarioId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchLlmOptions();
        if (cancelled) return;
        setLlmOptions(res);
        if (res) {
          const picked = pickInitialLlmSelectionFromApi(
            res,
            loadLauncherLlmSelectionRaw(),
          );
          setLlmSelection(picked);
        }
      } catch {
        // ignore; selector will show error state
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    storeLauncherLlmSelectionRaw(llmSelection);
  }, [llmSelection]);

  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          llmSelection: llmSelectionRef.current,
          chatMode: CHAT_MODE_LAUNCHER,
          workingDirectory: workingDirectoryRef.current?.trim() || undefined,
        }),
      }),
    [],
  );

  const {
    messages: chatMessages,
    sendMessage,
    setMessages,
    status,
    error,
    addToolOutput,
  } = useChat<AgentUIMessage>({
      id: "tool-test-launcher-agent-chat",
      messages: [],
      transport: chatTransport,
      experimental_throttle: 80,
    });

  const finishRun = useCallback(
    (
      runId: string,
      patch: Pick<
        LauncherAgentRunEntry,
        | "status"
        | "chatMessages"
        | "error"
        | "responseStartedAt"
        | "responseCompletedAt"
        | "responseCompletionKind"
        | "executionTool"
      >,
    ) => {
      onPatchRun(runId, patch);
      activeRunIdRef.current = null;
      streamStartedRef.current = false;
      lastPatchedMessagesKeyRef.current = "";
      responseStartedAtRef.current = undefined;
      responseCompletedAtRef.current = undefined;
      responseCompletionKindRef.current = undefined;
      executionToolRef.current = undefined;
      setRunning(false);
    },
    [onPatchRun],
  );

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      streamStartedRef.current = true;
    }
  }, [status]);

  useEffect(() => {
    onChatActionsReady?.({ addToolOutput });
    return () => {
      onChatActionsReady?.(null);
    };
  }, [addToolOutput, onChatActionsReady]);

  useEffect(() => {
    const runId = activeRunIdRef.current;
    if (!runId || !running) return;

    const messages = chatMessages as AgentUIMessage[];
    const last = messages[messages.length - 1];
    const messagesKey = `${messages.length}:${last?.id ?? ""}:${last?.parts.length ?? 0}`;
    if (lastPatchedMessagesKeyRef.current === messagesKey) return;
    lastPatchedMessagesKeyRef.current = messagesKey;

    const now = Date.now();
    const patch: Partial<LauncherAgentRunEntry> = { chatMessages: messages };

    if (
      responseStartedAtRef.current == null
      && hasAssistantResponseStarted(messages)
    ) {
      responseStartedAtRef.current = now;
      patch.responseStartedAt = now;
    }

    const executionTool = findFirstExecutionToolName(messages);
    if (executionTool && responseCompletedAtRef.current == null) {
      responseCompletedAtRef.current = now;
      responseCompletionKindRef.current = "execution";
      executionToolRef.current = executionTool;
      patch.responseCompletedAt = now;
      patch.responseCompletionKind = "execution";
      patch.executionTool = executionTool;
    }

    onPatchRun(runId, patch);
  }, [chatMessages, onPatchRun, running]);

  useEffect(() => {
    const runId = activeRunIdRef.current;
    if (!runId || !running) return;
    if (status === "streaming" || status === "submitted") return;

    const messages = chatMessages as AgentUIMessage[];
    const timingPatch: Partial<LauncherAgentRunEntry> = {
      responseStartedAt: responseStartedAtRef.current,
      responseCompletedAt: responseCompletedAtRef.current,
      responseCompletionKind: responseCompletionKindRef.current,
      executionTool: executionToolRef.current,
    };

    if (status === "ready" && streamStartedRef.current) {
      const finishPatch = { ...timingPatch };
      if (
        finishPatch.responseCompletedAt == null
        && finishPatch.responseStartedAt != null
      ) {
        const endedAt = Date.now();
        finishPatch.responseCompletedAt = endedAt;
        finishPatch.responseCompletionKind = "stream-end";
      }
      finishRun(runId, {
        status: "done",
        chatMessages: messages,
        ...finishPatch,
      });
      return;
    }
    if (status === "error") {
      finishRun(runId, {
        status: "error",
        chatMessages: messages,
        error: error?.message ?? "Chat request failed",
        ...timingPatch,
      });
    }
  }, [chatMessages, error, finishRun, running, status]);

  const runScenario = useCallback(
    async (targetScenarioId?: string) => {
      if (running) return;
      const sid = targetScenarioId ?? scenarioId;
      if (targetScenarioId) setScenarioId(targetScenarioId);
      const scenario = getLauncherAgentScenario(sid);
      const text = (targetScenarioId ? scenario?.userPrompt : prompt)?.trim();
      if (!text) return;

      const selectionLabel = resolveLlmSelectionLabel(llmSelection, llmOptions);
      const run: LauncherAgentRunEntry = {
        id: createLauncherAgentRunId(),
        at: Date.now(),
        scenarioId: scenario?.id ?? "custom",
        scenarioLabel: scenario?.label ?? "自定义",
        userPrompt: text,
        llmSelection,
        llmModelLabel: selectionLabel ?? llmSelection,
        chatMode: "launcher",
        status: "running",
        chatMessages: [],
      };

      onAppendRun(run);
      activeRunIdRef.current = run.id;
      streamStartedRef.current = false;
      lastPatchedMessagesKeyRef.current = "";
      responseStartedAtRef.current = undefined;
      responseCompletedAtRef.current = undefined;
      responseCompletionKindRef.current = undefined;
      executionToolRef.current = undefined;
      setRunning(true);
      setMessages([]);
      await sendMessage({ text });
    },
    [
      llmOptions,
      llmSelection,
      onAppendRun,
      prompt,
      running,
      scenarioId,
      sendMessage,
      setMessages,
    ],
  );

  const disabledAll = disabled || running;
  const scenario = getLauncherAgentScenario(scenarioId);

  return (
    <div className="tool-test-launcher-agent-panel">
      <p className="tool-test-launcher-panel__hint">
        走生产 <code>/api/chat</code>：<strong>chatMode=launcher</strong>。命中 command
        cache 或高置信 resolve 时服务端直连（无 LLM）；否则走所选模型 + 启动器工具集。
      </p>

      <div className="tool-test-prompt-model">
        <span className="tool-test-prompt-model__label">对话模型</span>
        <ModelSelector
          disabled={disabledAll}
          selection={llmSelection}
          onChange={(next) => {
            setLlmSelection(next);
            storeLauncherLlmSelectionRaw(next);
          }}
        />
      </div>

      <div className="tool-test-launcher-agent-panel__mode">
        <span className="tool-test-launcher-agent-panel__mode-badge">Launcher</span>
        <span className="tool-test-launcher-agent-panel__mode-badge tool-test-launcher-agent-panel__mode-badge--auto">
          {resolveLlmSelectionLabel(llmSelection, llmOptions) ?? llmSelection}
        </span>
      </div>

      <div className="autofix-panel__scenarios" role="group" aria-label="启动器场景">
        <p className="autofix-panel__section-label">场景</p>
        {LAUNCHER_AGENT_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`autofix-scenario-btn${scenarioId === s.id ? " autofix-scenario-btn--active" : ""}`}
            disabled={disabledAll}
            onClick={() => void runScenario(s.id)}
          >
            <span className="autofix-scenario-btn__label">{s.label}</span>
            <span className="autofix-scenario-btn__desc">{s.description}</span>
          </button>
        ))}
      </div>

      <div className="autofix-panel__prompt-block">
        <div className="autofix-panel__prompt-header">
          <span className="autofix-panel__section-label">用户 Prompt</span>
          <button
            type="button"
            className="autofix-panel__reset-btn"
            disabled={disabledAll || prompt === (scenario?.userPrompt ?? "")}
            onClick={() => setPrompt(scenario?.userPrompt ?? "")}
          >
            重置
          </button>
        </div>
        <textarea
          className="autofix-panel__textarea"
          rows={4}
          disabled={disabledAll}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          spellCheck={false}
          placeholder="输入用户口语…"
        />
      </div>

      <div className="autofix-panel__footer">
        <button
          type="button"
          className={`autofix-panel__run-btn${running ? " autofix-panel__run-btn--running" : ""}`}
          disabled={disabledAll || !prompt.trim() || !llmSelection.trim()}
          onClick={() => void runScenario(undefined)}
        >
          {running ? (
            <>
              <span className="autofix-panel__run-spinner" aria-hidden />
              对话中…
            </>
          ) : (
            "▶ 运行 Launcher Agent"
          )}
        </button>
        <p className="autofix-panel__run-hint">
          每次运行新增一场对话卡片 · 模型与启动器小窗共用 localStorage · 仅启动器工具集
        </p>
      </div>
    </div>
  );
}
