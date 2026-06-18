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
import {
  CONTEXT_COMPRESSION_SCENARIOS,
  getContextCompressionScenario,
  materializeScenarioMessages,
} from "@/lib/tool-test-context-compression-scenarios";
import {
  createContextCompressionRunId,
  type ContextCompressionDryRunResult,
  type ContextCompressionRunEntry,
  type ContextCompressionRunMode,
} from "@/lib/tool-test-context-compression-runs";
import { resolveLlmSelectionLabel } from "@/lib/tool-test-title-model-label";
import { LLM_AUTO_SELECTION } from "@/lib/llm-selection";
import { loadStoredLlmSelectionRaw, storeLlmSelectionRaw } from "@/lib/llm-prefs";
import { ToolTestAgentViewSection } from "@/components/tool-test/ToolTestAgentViewSection";

type ToolTestContextCompressionPanelProps = {
  disabled?: boolean;
  workingDirectory?: string;
  onAppendRun: (entry: ContextCompressionRunEntry) => void;
  onPatchRun: (id: string, patch: Partial<ContextCompressionRunEntry>) => void;
};

function buildRunSnapshot(params: {
  scenarioId: string;
  scenarioLabel: string;
  mode: ContextCompressionRunMode;
  llmSelection: string;
  llmModelLabel: string;
  messageCount: number;
  contextLimit: number;
  force: boolean;
}): ContextCompressionRunEntry {
  return {
    id: createContextCompressionRunId(),
    at: Date.now(),
    scenarioId: params.scenarioId,
    scenarioLabel: params.scenarioLabel,
    mode: params.mode,
    status: "running",
    llmSelection: params.llmSelection,
    llmModelLabel: params.llmModelLabel,
    messageCount: params.messageCount,
    contextLimit: params.contextLimit,
    force: params.force,
    chatMessages: params.mode === "chat" ? [] : undefined,
  };
}

export function ToolTestContextCompressionPanel({
  disabled,
  workingDirectory,
  onAppendRun,
  onPatchRun,
}: ToolTestContextCompressionPanelProps) {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<ContextCompressionRunMode>("dry-run");
  const [scenarioId, setScenarioId] = useState(
    () => CONTEXT_COMPRESSION_SCENARIOS[0]?.id ?? "threshold-90",
  );
  const [llmOptions, setLlmOptions] = useState<LlmOptionsResponse | null>(null);
  const [llmSelection, setLlmSelection] = useState(
    () => loadStoredLlmSelectionRaw() ?? LLM_AUTO_SELECTION,
  );
  const llmSelectionRef = useRef(llmSelection);
  llmSelectionRef.current = llmSelection;

  const activeRunIdRef = useRef<string | null>(null);
  const streamStartedRef = useRef(false);
  const lastPatchedMessagesKeyRef = useRef("");

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
            loadStoredLlmSelectionRaw(),
          );
          setLlmSelection(picked);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    storeLlmSelectionRaw(llmSelection);
  }, [llmSelection]);

  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => {
          const scenario = getContextCompressionScenario(scenarioId);
          return {
            llmSelection: llmSelectionRef.current,
            workingDirectory: workingDirectory?.trim() || undefined,
            contextCompressionForce:
              process.env.NODE_ENV === "development" && scenario?.force === true,
          };
        },
      }),
    [scenarioId, workingDirectory],
  );

  const { messages: chatMessages, sendMessage, setMessages, status } = useChat<AgentUIMessage>({
    id: "tool-test-context-compression-chat",
    messages: [],
    transport: chatTransport,
    experimental_throttle: 80,
  });

  const finishRun = useCallback(
    (
      runId: string,
      patch: Partial<ContextCompressionRunEntry> & { status: ContextCompressionRunEntry["status"] },
    ) => {
      onPatchRun(runId, patch);
      activeRunIdRef.current = null;
      streamStartedRef.current = false;
      lastPatchedMessagesKeyRef.current = "";
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
    const runId = activeRunIdRef.current;
    if (!runId || !running || mode !== "chat") return;

    const messages = chatMessages as AgentUIMessage[];
    const last = messages[messages.length - 1];
    const partCount = last?.parts.length ?? 0;
    const lastPart = last?.parts[partCount - 1];
    const lastPartTextLen =
      lastPart && "text" in lastPart && typeof lastPart.text === "string"
        ? lastPart.text.length
        : 0;
    const messagesKey = `${messages.length}:${last?.id ?? ""}:${partCount}:${lastPartTextLen}`;
    if (lastPatchedMessagesKeyRef.current === messagesKey) return;
    lastPatchedMessagesKeyRef.current = messagesKey;
    onPatchRun(runId, { chatMessages: messages });
  }, [chatMessages, mode, onPatchRun, running]);

  useEffect(() => {
    const runId = activeRunIdRef.current;
    if (!runId || !running || mode !== "chat") return;
    if (status === "streaming" || status === "submitted") return;

    const messages = chatMessages as AgentUIMessage[];
    if (status === "ready" && streamStartedRef.current) {
      finishRun(runId, { status: "done", chatMessages: messages });
      return;
    }
    if (status === "error") {
      finishRun(runId, {
        status: "error",
        error: "Chat request failed",
        chatMessages: messages,
      });
    }
  }, [chatMessages, finishRun, mode, running, status]);

  const runDryRun = useCallback(
    async (scenario: NonNullable<ReturnType<typeof getContextCompressionScenario>>) => {
      const messages = materializeScenarioMessages(scenario);
      const force = scenario.force === true;
      const selectionLabel = resolveLlmSelectionLabel(llmSelection, llmOptions);
      const run = buildRunSnapshot({
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        mode: "dry-run",
        llmSelection,
        llmModelLabel: selectionLabel ?? llmSelection,
        messageCount: messages.length,
        contextLimit: scenario.contextLimit,
        force,
      });
      onAppendRun(run);

      try {
        const res = await fetch("/api/dev/context-compression", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            contextLimit: scenario.contextLimit,
            llmSelection,
            force,
            workingDirectory: workingDirectory?.trim() || undefined,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          preview?: ContextCompressionDryRunResult["preview"];
          compressed?: boolean;
          summary?: string | null;
          systemSuffix?: string | null;
          modelMessageCount?: number;
          contextCompression?: ContextCompressionDryRunResult["contextCompression"];
          reusedSummary?: boolean;
          summarizeCalled?: boolean;
        };
        if (!res.ok || !data.ok) {
          finishRun(run.id, {
            status: "error",
            error: data.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        const dryRun: ContextCompressionDryRunResult = {
          compressed: data.compressed === true,
          preview: data.preview!,
          summary: data.summary ?? null,
          systemSuffix: data.systemSuffix ?? null,
          modelMessageCount: data.modelMessageCount ?? 0,
          contextCompression: data.contextCompression ?? null,
          reusedSummary: data.reusedSummary === true,
          summarizeCalled: data.summarizeCalled === true,
        };
        finishRun(run.id, { status: "done", dryRun });
      } catch (err) {
        finishRun(run.id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [finishRun, llmOptions, llmSelection, onAppendRun, workingDirectory],
  );

  const runChat = useCallback(
    async (scenario: NonNullable<ReturnType<typeof getContextCompressionScenario>>) => {
      const seedMessages = materializeScenarioMessages(scenario);
      const continuePrompt = scenario.continuePrompt?.trim();
      if (!continuePrompt) return;

      const force = scenario.force === true;
      const selectionLabel = resolveLlmSelectionLabel(llmSelection, llmOptions);
      const run = buildRunSnapshot({
        scenarioId: scenario.id,
        scenarioLabel: `${scenario.label} · Chat`,
        mode: "chat",
        llmSelection,
        llmModelLabel: selectionLabel ?? llmSelection,
        messageCount: seedMessages.length + 1,
        contextLimit: scenario.contextLimit,
        force,
      });
      onAppendRun(run);
      activeRunIdRef.current = run.id;
      streamStartedRef.current = false;
      lastPatchedMessagesKeyRef.current = "";
      setRunning(true);

      setMessages(seedMessages);
      await sendMessage({ text: continuePrompt });
    },
    [llmOptions, llmSelection, onAppendRun, sendMessage, setMessages],
  );

  const runScenario = useCallback(async () => {
    if (running) return;
    const scenario = getContextCompressionScenario(scenarioId);
    if (!scenario) return;

    setRunning(true);
    if (mode === "dry-run") {
      await runDryRun(scenario);
      return;
    }
    await runChat(scenario);
  }, [mode, runChat, runDryRun, running, scenarioId]);

  const disabledAll = disabled || running;
  const scenario = getContextCompressionScenario(scenarioId);

  return (
    <div className="autofix-panel ctx-compression-panel">
      <div className="tool-test-prompt-model">
        <span className="tool-test-prompt-model__label">摘要模型</span>
        <ModelSelector
          disabled={disabledAll}
          selection={llmSelection}
          onChange={(next) => {
            setLlmSelection(next);
            storeLlmSelectionRaw(next);
          }}
        />
      </div>

      <div className="ctx-compression-panel__mode" role="group" aria-label="运行模式">
        <p className="autofix-panel__section-label">运行模式</p>
        <div className="ctx-compression-panel__mode-row">
          <button
            type="button"
            className={`ctx-compression-mode-btn${mode === "dry-run" ? " ctx-compression-mode-btn--active" : ""}`}
            disabled={disabledAll}
            onClick={() => setMode("dry-run")}
          >
            Dry-run
          </button>
          <button
            type="button"
            className={`ctx-compression-mode-btn${mode === "chat" ? " ctx-compression-mode-btn--active" : ""}`}
            disabled={disabledAll || !scenario?.continuePrompt}
            onClick={() => setMode("chat")}
            title={scenario?.continuePrompt ? undefined : "当前场景无续写 prompt"}
          >
            Chat 续写
          </button>
        </div>
        <p className="ctx-compression-panel__mode-hint">
          {mode === "dry-run"
            ? "调用 /api/dev/context-compression，不发起完整对话"
            : "注入长线程后走 /api/chat，观察 assistant metadata 中的 contextCompression"}
        </p>
      </div>

      <div className="autofix-panel__scenarios" role="group" aria-label="压缩场景">
        <p className="autofix-panel__section-label">选择场景</p>
        {CONTEXT_COMPRESSION_SCENARIOS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`autofix-scenario-btn${scenarioId === item.id ? " autofix-scenario-btn--active" : ""}`}
            disabled={disabledAll}
            onClick={() => setScenarioId(item.id)}
          >
            <span className="autofix-scenario-btn__label">{item.label}</span>
            <span className="autofix-scenario-btn__desc">{item.description}</span>
          </button>
        ))}
      </div>

      {scenario?.continuePrompt ? (
        <div className="autofix-panel__prompt-block">
          <p className="autofix-panel__section-label">Chat 续写 Prompt</p>
          <p className="ctx-compression-panel__prompt-preview">{scenario.continuePrompt}</p>
        </div>
      ) : null}

      <div className="autofix-panel__footer">
        <button
          type="button"
          className={`autofix-panel__run-btn${running ? " autofix-panel__run-btn--running" : ""}`}
          disabled={disabledAll || !llmSelection.trim()}
          onClick={() => void runScenario()}
        >
          {running ? (
            <>
              <span className="autofix-panel__run-spinner" aria-hidden />
              运行中…
            </>
          ) : (
            `▶ ${mode === "dry-run" ? "Dry-run" : "Chat 续写"}`
          )}
        </button>
        <p className="autofix-panel__run-hint">
          生产逻辑：usage ≥90% 或估算 ≥92% 时按 token 预算切分；microcompact → 摘要 → reinject；多步 tool 回合内 prepareStep 再压缩；context length 错误 reactive 重试 1 次
        </p>
      </div>

      <ToolTestAgentViewSection disabled={disabledAll} />
    </div>
  );
}
