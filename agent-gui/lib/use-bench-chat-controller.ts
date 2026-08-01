"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import quickerbenchData from "@/benchmarks/quickerbench-tasks.json";
import {
  fetchLlmOptions,
  pickInitialLlmSelectionFromApi,
} from "@/components/chat/ModelSelector";
import type { ChatThreadExportResult } from "@/components/chat/ChatThreadExportDialog";
import { useAgentChatSession } from "@/components/chat/useAgentChatSession";
import type { AgentUIMessage } from "@/lib/chat-types";
import { CHAT_MODE_AGENT } from "@/lib/chat-mode";
import { extractBenchActionIdFromMessages } from "@/lib/bench-mode";
import { appendBenchExportNotice } from "@/lib/bench-export-notice";
import { createDevTempWorkspaceClient } from "@/lib/dev-temp-workspace.client";
import { loadStoredEnabledTools } from "@/lib/tool-registry";
import { loadStoredLlmSelectionRaw, storeLlmSelectionRaw } from "@/lib/llm-prefs";
import { LLM_AUTO_SELECTION } from "@/lib/llm-selection";
import type { QuickerBenchCatalog, QuickerBenchTask } from "@/lib/quickerbench/catalog-types";
import {
  createQuickerBenchRunId,
  type QuickerBenchRunEntry,
} from "@/lib/tool-test-quickerbench-runs";
import { cleanupToolTestChatSession, formatToolTestCleanupHint } from "@/lib/tool-test-chat-cleanup";
import {
  type ToolTestExportMeta,
  useToolTestChatExport,
} from "@/lib/tool-test-chat-export";

const BENCH_CHAT_THREAD_ID = "bench-chat-main";
const BENCH_MAX_AUTO_NUDGES = 2;
const BENCH_CONTINUE_USER_MESSAGE =
  "请继续完成该评测任务：创建新动作、编写步骤，并通过 Quicker 调试确认结果。";
const catalog = quickerbenchData as unknown as QuickerBenchCatalog;

export function buildQuickerBenchExportMeta(
  run: QuickerBenchRunEntry,
  workspacePath?: string,
): ToolTestExportMeta {
  return {
    threadId: `bench-${run.taskId}-${run.id}`,
    title: run.taskLabel,
    workingDirectory: run.workspacePath ?? workspacePath,
    startedAt: run.at,
  };
}

export type UseBenchChatControllerOptions = {
  disabled?: boolean;
};

export function useBenchChatController(options: UseBenchChatControllerOptions = {}) {
  const { disabled: disabledProp = false } = options;

  const [llmSelection, setLlmSelection] = useState(
    () => loadStoredLlmSelectionRaw() ?? LLM_AUTO_SELECTION,
  );
  const [runs, setRuns] = useState<QuickerBenchRunEntry[]>([]);
  const [activeTaskId, setActiveTaskId] = useState(
    () => catalog.coreTaskIds[0] ?? catalog.tasks[0]?.id ?? "",
  );
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [benchWorkspace, setBenchWorkspace] = useState<string | undefined>();
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupHint, setCleanupHint] = useState<string | null>(null);
  const [chatMode] = useState(CHAT_MODE_AGENT);
  const [enabledTools] = useState(() => loadStoredEnabledTools());

  const activeRunIdRef = useRef<string | null>(null);
  const activeRunRef = useRef<QuickerBenchRunEntry | null>(null);
  const autoExportedRunIdsRef = useRef<Set<string>>(new Set());
  const benchNudgeCountRef = useRef<Map<string, number>>(new Map());
  const benchNudgeInFlightRef = useRef(false);
  const benchUserStopRequestedRef = useRef(false);

  const {
    exporting,
    exportMessages,
  } = useToolTestChatExport();

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
    threadId: BENCH_CHAT_THREAD_ID,
    initialMessages: [],
    ephemeral: true,
    visible: true,
    workingDirectory: benchWorkspace ?? "",
    titleManual: false,
    chatMode,
    enabledTools,
    llmSelection,
    onPersist: () => {},
    benchMode: true,
  });

  const chatBusy = status === "streaming" || status === "submitted";
  const disabled = disabledProp || !llmSelection.trim();

  useEffect(() => {
    storeLlmSelectionRaw(llmSelection);
  }, [llmSelection]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchLlmOptions();
        if (cancelled || !res) return;
        setLlmSelection(pickInitialLlmSelectionFromApi(res, loadStoredLlmSelectionRaw()));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearActiveRun = useCallback(() => {
    setActiveRunId(null);
    activeRunIdRef.current = null;
    activeRunRef.current = null;
  }, []);

  const patchRun = useCallback((id: string, patch: Partial<QuickerBenchRunEntry>) => {
    setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const appendRun = useCallback((entry: QuickerBenchRunEntry) => {
    setRuns((prev) => [entry, ...prev]);
  }, []);

  const finalizeBenchExport = useCallback(
    async (
      runId: string,
      snapshot: AgentUIMessage[],
      runEntry?: QuickerBenchRunEntry | null,
    ) => {
      if (snapshot.length === 0 || autoExportedRunIdsRef.current.has(runId)) {
        return;
      }
      const run =
        runEntry
        ?? (activeRunRef.current?.id === runId
          ? activeRunRef.current
          : runs.find((entry) => entry.id === runId));
      if (!run) return;

      autoExportedRunIdsRef.current.add(runId);
      const meta = buildQuickerBenchExportMeta(run, benchWorkspace);
      const result = await exportMessages(meta, snapshot, { silent: true });
      if (!result) {
        autoExportedRunIdsRef.current.delete(runId);
        return;
      }

      const withNotice = appendBenchExportNotice(snapshot, result);
      patchRun(runId, { exportResult: result, chatMessages: withNotice });
      if (activeRunIdRef.current === runId || selectedRunId === runId) {
        setMessages(withNotice);
      }
    },
    [benchWorkspace, exportMessages, patchRun, runs, selectedRunId, setMessages],
  );

  useEffect(() => {
    if (chatBusy) {
      benchNudgeInFlightRef.current = false;
    }
  }, [chatBusy]);

  const stopActiveRun = useCallback(() => {
    benchUserStopRequestedRef.current = true;
    stop();
  }, [stop]);

  useEffect(() => {
    const runId = activeRunIdRef.current;
    if (!runId || chatBusy) return;
    if (benchUserStopRequestedRef.current) {
      benchUserStopRequestedRef.current = false;
      patchRun(runId, {
        status: "error",
        error: "用户停止",
        chatMessages: messages,
      });
      void finalizeBenchExport(runId, messages);
      clearActiveRun();
      return;
    }
    if (status === "error") {
      patchRun(runId, {
        status: "error",
        error: error?.message ?? "chat error",
        chatMessages: messages,
      });
      void finalizeBenchExport(runId, messages);
      clearActiveRun();
      return;
    }
    if (status !== "ready" || messages.length === 0) return;

    const task = catalog.tasks.find((t) => t.id === activeTaskId);
    if (!task) {
      clearActiveRun();
      return;
    }

    const actionId = extractBenchActionIdFromMessages(messages);
    patchRun(runId, { chatMessages: messages, actionId });

    if (actionId) {
      const runEntry = activeRunRef.current;
      patchRun(runId, { status: "done", actionId, chatMessages: messages });
      clearActiveRun();
      void finalizeBenchExport(runId, messages, runEntry);
      return;
    }

    const nudges = benchNudgeCountRef.current.get(runId) ?? 0;
    if (nudges < BENCH_MAX_AUTO_NUDGES && !benchNudgeInFlightRef.current) {
      benchNudgeCountRef.current.set(runId, nudges + 1);
      benchNudgeInFlightRef.current = true;
      patchRun(runId, { status: "running", chatMessages: messages });
      sendMessageSafe({ text: BENCH_CONTINUE_USER_MESSAGE });
      return;
    }

    patchRun(runId, {
      status: "error",
      error: "Agent 在未创建动作前停止",
      chatMessages: messages,
    });
    void finalizeBenchExport(runId, messages);
    clearActiveRun();
  }, [
    activeTaskId,
    chatBusy,
    clearActiveRun,
    error,
    finalizeBenchExport,
    messages,
    patchRun,
    sendMessageSafe,
    status,
  ]);

  const runTask = useCallback(
    async (taskId: string) => {
      if (disabled || chatBusy) return;
      const task = catalog.tasks.find((t) => t.id === taskId);
      if (!task) return;

      setActiveTaskId(taskId);
      const run: QuickerBenchRunEntry = {
        id: createQuickerBenchRunId(),
        at: Date.now(),
        taskId: task.id,
        taskLabel: task.label,
        tier: task.tier,
        status: "preparing",
      };
      appendRun(run);
      activeRunIdRef.current = run.id;
      activeRunRef.current = run;
      benchNudgeCountRef.current.set(run.id, 0);
      setActiveRunId(run.id);
      setSelectedRunId(run.id);

      try {
        setMessages([]);
        const created = await createDevTempWorkspaceClient({ seed: "empty" });
        setBenchWorkspace(created.path);
        patchRun(run.id, { workspacePath: created.path, status: "running" });
        await sendMessageSafe({ text: task.userPrompt.trim() });
      } catch (err) {
        patchRun(run.id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
        activeRunIdRef.current = null;
        activeRunRef.current = null;
        setActiveRunId(null);
      }
    },
    [appendRun, chatBusy, disabled, patchRun, sendMessageSafe, setMessages],
  );

  const cleanupSession = useCallback(async () => {
    if (cleanupBusy || chatBusy) return;
    setCleanupBusy(true);
    setCleanupHint(null);
    try {
      const result = await cleanupToolTestChatSession({
        cwd: benchWorkspace,
        messages,
      });
      setMessages([]);
      setCleanupHint(formatToolTestCleanupHint(result));
    } catch (err) {
      setCleanupHint(err instanceof Error ? err.message : String(err));
    } finally {
      setCleanupBusy(false);
    }
  }, [benchWorkspace, chatBusy, cleanupBusy, messages, setMessages]);

  const latestRun = runs[0] ?? null;
  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId) ?? latestRun,
    [latestRun, runs, selectedRunId],
  );

  const viewingHistory = Boolean(
    selectedRun
      && activeRunId !== selectedRun.id
      && selectedRun.chatMessages
      && selectedRun.chatMessages.length > 0
      && !chatBusy,
  );

  const displayMessages = viewingHistory && selectedRun?.chatMessages
    ? selectedRun.chatMessages
    : messages;

  const activeExportMeta = useMemo(
    () => (selectedRun ? buildQuickerBenchExportMeta(selectedRun, benchWorkspace) : null),
    [benchWorkspace, selectedRun],
  );

  const exportActiveConversation = useCallback(async () => {
    if (!selectedRun || displayMessages.length === 0) return;
    const meta = buildQuickerBenchExportMeta(selectedRun, benchWorkspace);
    const result = await exportMessages(meta, displayMessages, { silent: true });
    if (!result) return;

    const withNotice = appendBenchExportNotice(displayMessages, result);
    patchRun(selectedRun.id, { exportResult: result, chatMessages: withNotice });
    if (!viewingHistory) {
      setMessages(withNotice);
    }
  }, [
    benchWorkspace,
    displayMessages,
    exportMessages,
    patchRun,
    selectedRun,
    setMessages,
    viewingHistory,
  ]);

  const activeExportResult = selectedRun?.exportResult ?? null;

  return {
    tasks: catalog.tasks,
    llmSelection,
    setLlmSelection,
    activeTaskId,
    runs,
    selectedRunId,
    setSelectedRunId,
    selectedRun,
    latestRun,
    activeRunId,
    runTask,
    chatBusy,
    disabled,
    benchWorkspace,
    messages: displayMessages,
    liveMessages: messages,
    viewingHistory,
    status,
    error,
    stop: stopActiveRun,
    clearError,
    addToolApprovalResponse,
    addToolOutput,
    repairToolCalls,
    sendMessageSafe,
    setMessages,
    chatMode,
    enabledTools,
    cleanupSession,
    cleanupBusy,
    cleanupHint,
    exportActiveConversation,
    exporting,
    activeExportResult,
    activeExportMeta,
  };
}

export type BenchChatController = ReturnType<typeof useBenchChatController>;
