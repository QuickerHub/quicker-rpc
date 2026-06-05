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
  AUTO_FIX_SCENARIOS,
  getAutoFixScenario,
} from "@/lib/tool-test-autofix-scenarios";
import {
  createAutoFixRunId,
  type AutoFixRunEntry,
} from "@/lib/tool-test-autofix-runs";
import { resolveLlmSelectionLabel } from "@/lib/tool-test-title-model-label";
import { LLM_AUTO_SELECTION } from "@/lib/llm-selection";
import { loadStoredLlmSelectionRaw, storeLlmSelectionRaw } from "@/lib/llm-prefs";

type ToolTestAutoFixPanelProps = {
  disabled?: boolean;
  workingDirectory?: string;
  onAppendRun: (entry: AutoFixRunEntry) => void;
  onPatchRun: (id: string, patch: Partial<AutoFixRunEntry>) => void;
};

function buildRunSnapshot(params: {
  scenarioId: string;
  scenarioLabel: string;
  requestPayload: string;
  llmSelection: string;
  llmModelLabel: string;
}): AutoFixRunEntry {
  return {
    id: createAutoFixRunId(),
    at: Date.now(),
    scenarioId: params.scenarioId,
    scenarioLabel: params.scenarioLabel,
    requestPayload: params.requestPayload,
    llmSelection: params.llmSelection,
    llmModelLabel: params.llmModelLabel,
    status: "running",
    chatMessages: [],
  };
}

export function ToolTestAutoFixPanel({
  disabled,
  workingDirectory,
  onAppendRun,
  onPatchRun,
}: ToolTestAutoFixPanelProps) {
  const [running, setRunning] = useState(false);
  const [scenarioId, setScenarioId] = useState(() => AUTO_FIX_SCENARIOS[0]?.id ?? "value-prefix");
  const [llmOptions, setLlmOptions] = useState<LlmOptionsResponse | null>(null);
  const [llmSelection, setLlmSelection] = useState(
    () => loadStoredLlmSelectionRaw() ?? LLM_AUTO_SELECTION,
  );
  const llmSelectionRef = useRef(llmSelection);
  llmSelectionRef.current = llmSelection;
  const [customPrompt, setCustomPrompt] = useState(() => getAutoFixScenario(scenarioId)?.userPrompt ?? "");

  const activeRunIdRef = useRef<string | null>(null);
  const streamStartedRef = useRef(false);
  const lastPatchedMessagesKeyRef = useRef("");

  useEffect(() => {
    const next = getAutoFixScenario(scenarioId)?.userPrompt ?? "";
    setCustomPrompt(next);
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
            loadStoredLlmSelectionRaw(),
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
    storeLlmSelectionRaw(llmSelection);
  }, [llmSelection]);

  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({
          llmSelection: llmSelectionRef.current,
          workingDirectory: workingDirectory?.trim() || undefined,
        }),
      }),
    [workingDirectory],
  );

  const { messages: chatMessages, sendMessage, setMessages, status } = useChat<AgentUIMessage>({
    id: "tool-test-autofix-chat",
    messages: [],
    transport: chatTransport,
    experimental_throttle: 80,
  });

  const finishRun = useCallback(
    (
      runId: string,
      patch: Pick<AutoFixRunEntry, "status" | "result" | "chatMessages">,
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
    if (!runId || !running) return;

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
  }, [chatMessages, onPatchRun, running]);

  useEffect(() => {
    const runId = activeRunIdRef.current;
    if (!runId || !running) return;
    if (status === "streaming" || status === "submitted") return;

    const messages = chatMessages as AgentUIMessage[];
    if (status === "ready" && streamStartedRef.current) {
      finishRun(runId, {
        status: "done",
        result: { source: "chat" },
        chatMessages: messages,
      });
      return;
    }
    if (status === "error") {
      finishRun(runId, {
        status: "error",
        result: { source: "chat", error: "Chat request failed" },
        chatMessages: messages,
      });
    }
  }, [chatMessages, finishRun, running, status]);

  const runScenario = useCallback(async () => {
    if (running) return;
    const scenario = getAutoFixScenario(scenarioId);
    if (!scenario) return;
    const prompt = customPrompt.trim();
    if (!prompt) return;

    const selectionLabel = resolveLlmSelectionLabel(llmSelection, llmOptions);
    const run = buildRunSnapshot({
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      requestPayload: prompt,
      llmSelection,
      llmModelLabel: selectionLabel ?? (llmSelection || "—"),
    });

    onAppendRun(run);
    activeRunIdRef.current = run.id;
    streamStartedRef.current = false;
    lastPatchedMessagesKeyRef.current = "";
    setRunning(true);

    setMessages([]);
    await sendMessage({ text: prompt });
  }, [customPrompt, llmOptions, llmSelection, onAppendRun, running, scenarioId, sendMessage, setMessages]);

  const disabledAll = disabled || running;
  const scenario = getAutoFixScenario(scenarioId);

  return (
    <div className="autofix-panel">
      {/* Model row */}
      <div className="tool-test-prompt-model">
        <span className="tool-test-prompt-model__label">对话模型</span>
        <ModelSelector
          disabled={disabledAll}
          selection={llmSelection}
          onChange={(next) => {
            setLlmSelection(next);
            storeLlmSelectionRaw(next);
          }}
        />
      </div>

      {/* Scenario cards */}
      <div className="autofix-panel__scenarios" role="group" aria-label="修复场景">
        <p className="autofix-panel__section-label">选择场景</p>
        {AUTO_FIX_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`autofix-scenario-btn${scenarioId === s.id ? " autofix-scenario-btn--active" : ""}`}
            disabled={disabledAll}
            onClick={() => setScenarioId(s.id)}
          >
            <span className="autofix-scenario-btn__label">{s.label}</span>
            <span className="autofix-scenario-btn__desc">{s.description}</span>
          </button>
        ))}
      </div>

      {/* Prompt editor */}
      <div className="autofix-panel__prompt-block">
        <div className="autofix-panel__prompt-header">
          <span className="autofix-panel__section-label">Prompt</span>
          <button
            type="button"
            className="autofix-panel__reset-btn"
            disabled={disabledAll || customPrompt === (scenario?.userPrompt ?? "")}
            onClick={() => setCustomPrompt(scenario?.userPrompt ?? "")}
            title="重置为默认 prompt"
          >
            重置
          </button>
        </div>
        <textarea
          className="autofix-panel__textarea"
          rows={12}
          disabled={disabledAll}
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          spellCheck={false}
        />
      </div>

      {/* Run button */}
      <div className="autofix-panel__footer">
        <button
          type="button"
          className={`autofix-panel__run-btn${running ? " autofix-panel__run-btn--running" : ""}`}
          disabled={disabledAll || !customPrompt.trim() || !llmSelection.trim()}
          onClick={() => void runScenario()}
        >
          {running ? (
            <>
              <span className="autofix-panel__run-spinner" aria-hidden />
              运行中…
            </>
          ) : (
            "▶ 运行场景"
          )}
        </button>
        <p className="autofix-panel__run-hint">
          走完整 /api/chat 流：工具调用 → 错误回读 → patch → diagnostics
        </p>
      </div>
    </div>
  );
}

