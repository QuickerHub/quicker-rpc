"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { generateId } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { DocsViewerProvider } from "@/lib/docs-viewer";
import {
  WorkspaceExplorerPanelProvider,
  WorkspaceExplorerShellProvider,
} from "@/lib/workspace-explorer";
import { useQkrpcPing } from "@/lib/use-qkrpc-ping";
import {
  extractProtocolVersionFromPing,
  useAppVersionSnapshot,
} from "@/lib/use-app-versions";
import { useChatStore } from "@/lib/use-chat-store";
import { computeToolTestCoverage } from "@/lib/tool-test-coverage";
import {
  TOOL_TEST_SUITES,
  toolTestSuitesForRunAll,
  type ToolTestStep,
  type ToolTestSuite,
} from "@/lib/tool-test-suites";
import {
  createRunningToolPart,
  toolPartToError,
  toolPartToSuccess,
  updateAssistantMessageParts,
} from "@/lib/tool-test-parts";
import {
  TOOL_TEST_SESSION_ASSISTANT_ID,
  TOOL_TEST_SESSION_RUN_ID,
  createEmptyToolTestSession,
  getToolTestSessionParts,
} from "@/lib/tool-test-tools-session";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import { DesktopWindowControls } from "@/components/shell/DesktopWindowControls";
import { TitlebarThemeSwitcher } from "@/components/chat/TitlebarThemeSwitcher";
import {
  useDesktopShell,
  useDesktopShellKind,
  useNativeWindowControlsOverlay,
  useShellPlatform,
} from "@/lib/desktop-shell";
import {
  defaultStepInputJson,
  formatToolTestInputCompact,
} from "@/lib/tool-test-input-format";
import { ToolTestPromptPanel } from "@/components/tool-test/ToolTestPromptPanel";
import { ToolTestSuiteDetailDialog } from "@/components/tool-test/ToolTestSuiteDetailDialog";
import { isShellToolName } from "@/lib/host-tool-constants";
import { ToolTestTitleResultPane } from "@/components/tool-test/ToolTestTitleResultPane";
import type { TitleTestRunEntry } from "@/lib/tool-test-title-runs";
import { ToolTestAutoFixPanel } from "@/components/tool-test/ToolTestAutoFixPanel";
import { ToolTestAutoFixResultPane } from "@/components/tool-test/ToolTestAutoFixResultPane";
import { ToolTestContextCompressionPanel } from "@/components/tool-test/ToolTestContextCompressionPanel";
import { ToolTestContextCompressionResultPane } from "@/components/tool-test/ToolTestContextCompressionResultPane";
import { ToolTestVoiceInputPanel } from "@/components/tool-test/ToolTestVoiceInputPanel";
import { ToolTestVoiceInputResultPane } from "@/components/tool-test/ToolTestVoiceInputResultPane";
import { ToolTestAskQuestionPanel } from "@/components/tool-test/ToolTestAskQuestionPanel";
import { ToolTestAskQuestionResultPane } from "@/components/tool-test/ToolTestAskQuestionResultPane";
import {
  ToolTestSidebarTabs,
  type ToolTestSidebarTab,
} from "@/components/tool-test/ToolTestSidebarTabs";
import {
  ToolTestLauncherPanel,
  type ToolTestLauncherSubTab,
} from "@/components/tool-test/ToolTestLauncherPanel";
import { ToolTestLauncherResultPane } from "@/components/tool-test/ToolTestLauncherResultPane";
import { ToolTestActionTracePanel } from "@/components/tool-test/ToolTestActionTracePanel";
import { ToolTestActionTraceMain } from "@/components/tool-test/ToolTestActionTraceMain";
import { ToolTestActionRuntimePanel } from "@/components/tool-test/ToolTestActionRuntimePanel";
import { ToolTestActionRuntimeResultPane } from "@/components/tool-test/ToolTestActionRuntimeResultPane";
import type { ActionRuntimeRunEntry } from "@/lib/action-runtime-test-runs";
import {
  ToolTestPromptChatPane,
  ToolTestPromptChatProvider,
  ToolTestPromptChatSidebar,
} from "@/components/tool-test/ToolTestPromptChatSection";
import { ToolTestSuiteResultPane } from "@/components/tool-test/ToolTestSuiteResultPane";
import type { ToolSuiteRunEntry } from "@/lib/tool-test-suite-runs";
import type { AutoFixRunEntry } from "@/lib/tool-test-autofix-runs";
import type { ContextCompressionRunEntry } from "@/lib/tool-test-context-compression-runs";
import type { VoiceInputRunEntry } from "@/lib/tool-test-voice-input-runs";
import type { AskQuestionRunEntry } from "@/lib/tool-test-ask-question-runs";
import {
  getDefaultAskQuestionScenario,
  type AskQuestionScenario,
} from "@/lib/tool-test-ask-question-scenarios";
import type { SettingsIntentRunEntry } from "@/lib/quicker-settings-intent-runs";
import type { ChatAddToolOutput } from "@/lib/chat-tool-actions";
import type { LauncherAgentRunEntry } from "@/lib/tool-test-launcher-agent-runs";
import type { LauncherResolveRunEntry } from "@/lib/tool-test-launcher-resolve-runs";
import { requestVoicePluginSetup } from "@/lib/voice-input/voice-plugin-install-flow";
import { ToolTestLlmProbePanel } from "@/components/tool-test/ToolTestLlmProbePanel";
import { ToolTestLlmProbeResultPane } from "@/components/tool-test/ToolTestLlmProbeResultPane";
import type { LlmEndpointProbeReport } from "@/lib/llm-endpoint-probe-core";
import {
  defaultToolTestSidebarTab,
  loadStoredToolTestSidebarTab,
  storeToolTestSidebarTab,
} from "@/lib/tool-test-sidebar-prefs";

type StepInputOverrides = Record<string, string>;

type PendingApproval = {
  suiteId: string;
  step: ToolTestStep;
  toolCallId: string;
  resolve: (approved: boolean) => void;
};

async function callToolExecuteApi(params: {
  toolName: string;
  input: unknown;
  workingDirectory?: string;
  approved?: boolean;
  toolCallId: string;
}): Promise<
  | { ok: true; output: unknown }
  | { ok: false; error: string }
  | { needsApproval: true }
> {
  const res = await fetch("/api/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (res.status === 409 && data.needsApproval === true) {
    return { needsApproval: true };
  }
  if (!res.ok) {
    const err =
      typeof data.error === "string"
        ? data.error
        : `HTTP ${res.status}`;
    return { ok: false, error: err };
  }
  return { ok: true, output: data.output };
}

function IconBackToChat() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9.75 3.25 5 8l4.75 4.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function parseStepInputJson(raw: string, fallback: Record<string, unknown>): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Input must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function resolveStepInputRaw(
  overrideKey: string,
  step: ToolTestStep,
  stepOverrides: StepInputOverrides,
): string {
  return stepOverrides[overrideKey] ?? defaultStepInputJson(step.input);
}

function ToolTestSuiteCard({
  suite,
  runningSuiteId,
  onRun,
  onShowDetail,
  disabled,
}: {
  suite: ToolTestSuite;
  runningSuiteId: string | null;
  onRun: (suite: ToolTestSuite) => void;
  onShowDetail: (suite: ToolTestSuite) => void;
  disabled: boolean;
}) {
  const busy = runningSuiteId === suite.id;
  const step = suite.steps[0];
  const inputHint = step ? formatToolTestInputCompact(step.input) : "";

  return (
    <section className="tool-test-suite-card tool-test-suite-card--compact">
      <div className="tool-test-suite-card__main">
        <div className="tool-test-suite-card__identity">
          <code className="tool-test-suite-card__tool-id" title={suite.description}>
            {suite.title}
          </code>
          {suite.writes ? (
            <span className="tool-test-suite-card__tag" title="Writes workspace or Quicker data">
              W
            </span>
          ) : null}
          {suite.optional ? (
            <span
              className="tool-test-suite-card__tag tool-test-suite-card__tag--muted"
              title="Optional — failure does not block Run all"
            >
              opt
            </span>
          ) : null}
          {suite.interactive ? (
            <span
              className="tool-test-suite-card__tag tool-test-suite-card__tag--muted"
              title="Needs Confirm/Cancel in UI"
            >
              UI
            </span>
          ) : null}
        </div>
        {inputHint ? (
          <span className="tool-test-suite-card__input-hint" title={suite.description}>
            {inputHint}
          </span>
        ) : null}
      </div>
      <div className="tool-test-suite-card__actions">
        <button
          type="button"
          className="tool-test-suite-card__detail"
          disabled={disabled}
          onClick={() => onShowDetail(suite)}
          aria-label={`${suite.title} details`}
        >
          JSON
        </button>
        <button
          type="button"
          className="tool-test-suite-card__run"
          disabled={disabled || busy}
          onClick={() => onRun(suite)}
        >
          {busy ? "…" : "Run"}
        </button>
      </div>
    </section>
  );
}

export function ToolTestPage() {
  const { store, defaultCwd } = useChatStore();
  const workingDirectory =
    store.workingDirectory.trim() || defaultCwd.trim();
  const { ping, refreshPing, connectTick } = useQkrpcPing();
  const { agentDisplayVersion, qkrpcDisplayVersion } =
    useAppVersionSnapshot(connectTick);
  const protocolVersion = extractProtocolVersionFromPing(ping);
  const isDesktop = useDesktopShell();
  const shellKind = useDesktopShellKind();
  const platform = useShellPlatform();
  const usesNativeWco = useNativeWindowControlsOverlay();
  const titlebarClass = [
    "tool-test-titlebar",
    shellKind === "tauri" ? "app-titlebar--tauri" : "",
    shellKind === "electron" ? "app-titlebar--electron" : "",
    isDesktop && platform !== "macos" ? "app-titlebar--frameless" : "",
    usesNativeWco ? "app-titlebar--electron-wco" : "",
    isDesktop && platform === "macos" ? "app-titlebar--mac-overlay" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const [toolSuiteRuns, setToolSuiteRuns] = useState<ToolSuiteRunEntry[]>([]);
  const [runningSuiteId, setRunningSuiteId] = useState<string | null>(null);
  const [runningAllSuites, setRunningAllSuites] = useState(false);
  const [stepOverrides, setStepOverrides] = useState<StepInputOverrides>({});
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(
    null,
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<ToolTestSidebarTab>(
    () => defaultToolTestSidebarTab(),
  );
  const [titleTestRuns, setTitleTestRuns] = useState<TitleTestRunEntry[]>([]);
  const [autoFixRuns, setAutoFixRuns] = useState<AutoFixRunEntry[]>([]);
  const [contextCompressionRuns, setContextCompressionRuns] = useState<
    ContextCompressionRunEntry[]
  >([]);
  const [voiceInputRuns, setVoiceInputRuns] = useState<VoiceInputRunEntry[]>([]);
  const [askQuestionRuns, setAskQuestionRuns] = useState<AskQuestionRunEntry[]>([]);
  const [activeAskQuestionScenario, setActiveAskQuestionScenario] =
    useState<AskQuestionScenario | null>(() => getDefaultAskQuestionScenario());
  const [launcherSubTab, setLauncherSubTab] = useState<ToolTestLauncherSubTab>("agent");
  const [launcherAgentRuns, setLauncherAgentRuns] = useState<LauncherAgentRunEntry[]>([]);
  const [launcherAgentAddToolOutput, setLauncherAgentAddToolOutput] =
    useState<ChatAddToolOutput | null>(null);
  const [launcherResolveRuns, setLauncherResolveRuns] = useState<LauncherResolveRunEntry[]>([]);
  const [settingsIntentRuns, setSettingsIntentRuns] = useState<SettingsIntentRunEntry[]>([]);
  const [detailSuite, setDetailSuite] = useState<ToolTestSuite | null>(null);
  const [voiceInstallBusy, setVoiceInstallBusy] = useState(false);
  const [llmProbeReport, setLlmProbeReport] = useState<LlmEndpointProbeReport | null>(null);
  const [llmProbeError, setLlmProbeError] = useState<string | null>(null);
  const [llmProbeRunning, setLlmProbeRunning] = useState(false);
  const [actionRuntimeRuns, setActionRuntimeRuns] = useState<ActionRuntimeRunEntry[]>([]);

  const handleVoiceInstallTest = useCallback(() => {
    if (voiceInstallBusy) return;
    setVoiceInstallBusy(true);
    void requestVoicePluginSetup({
      skipConfirm: true,
      force: true,
      preferNetwork: process.env.NODE_ENV === "development",
    }).finally(() => setVoiceInstallBusy(false));
  }, [voiceInstallBusy]);

  const appendTitleTestRun = useCallback((entry: TitleTestRunEntry) => {
    setTitleTestRuns((prev) => [...prev, entry]);
  }, []);

  const patchTitleTestRun = useCallback(
    (id: string, patch: Partial<TitleTestRunEntry>) => {
      setTitleTestRuns((prev) =>
        prev.map((run) => (run.id === id ? { ...run, ...patch } : run)),
      );
    },
    [],
  );

  const clearTitleTestRuns = useCallback(() => {
    setTitleTestRuns([]);
  }, []);

  const appendActionRuntimeRun = useCallback((entry: ActionRuntimeRunEntry) => {
    setActionRuntimeRuns((prev) => [...prev, entry]);
  }, []);

  const patchActionRuntimeRun = useCallback(
    (id: string, patch: Partial<ActionRuntimeRunEntry>) => {
      setActionRuntimeRuns((prev) =>
        prev.map((run) => (run.id === id ? { ...run, ...patch } : run)),
      );
    },
    [],
  );

  const clearActionRuntimeRuns = useCallback(() => {
    setActionRuntimeRuns([]);
  }, []);

  const appendAutoFixRun = useCallback((entry: AutoFixRunEntry) => {
    setAutoFixRuns((prev) => [...prev, entry]);
  }, []);

  const patchAutoFixRun = useCallback(
    (id: string, patch: Partial<AutoFixRunEntry>) => {
      setAutoFixRuns((prev) =>
        prev.map((run) => (run.id === id ? { ...run, ...patch } : run)),
      );
    },
    [],
  );

  const clearAutoFixRuns = useCallback(() => {
    setAutoFixRuns([]);
  }, []);

  const appendContextCompressionRun = useCallback(
    (entry: ContextCompressionRunEntry) => {
      setContextCompressionRuns((prev) => [...prev, entry]);
    },
    [],
  );

  const patchContextCompressionRun = useCallback(
    (id: string, patch: Partial<ContextCompressionRunEntry>) => {
      setContextCompressionRuns((prev) =>
        prev.map((run) => (run.id === id ? { ...run, ...patch } : run)),
      );
    },
    [],
  );

  const clearContextCompressionRuns = useCallback(() => {
    setContextCompressionRuns([]);
  }, []);

  const appendVoiceInputRun = useCallback((entry: VoiceInputRunEntry) => {
    setVoiceInputRuns((prev) => [...prev, entry]);
  }, []);

  const patchVoiceInputRun = useCallback(
    (id: string, patch: Partial<VoiceInputRunEntry>) => {
      setVoiceInputRuns((prev) =>
        prev.map((run) => (run.id === id ? { ...run, ...patch } : run)),
      );
    },
    [],
  );

  const clearVoiceInputRuns = useCallback(() => {
    setVoiceInputRuns([]);
  }, []);

  const appendAskQuestionRun = useCallback((entry: AskQuestionRunEntry) => {
    setAskQuestionRuns((prev) => [...prev, entry]);
  }, []);

  const clearAskQuestionRuns = useCallback(() => {
    setAskQuestionRuns([]);
  }, []);

  const appendSettingsIntentRun = useCallback((entry: SettingsIntentRunEntry) => {
    setSettingsIntentRuns((prev) => [...prev, entry]);
  }, []);

  const patchSettingsIntentRun = useCallback(
    (id: string, patch: Partial<SettingsIntentRunEntry>) => {
      setSettingsIntentRuns((prev) =>
        prev.map((run) => (run.id === id ? { ...run, ...patch } : run)),
      );
    },
    [],
  );

  const clearSettingsIntentRuns = useCallback(() => {
    setSettingsIntentRuns([]);
  }, []);

  const appendLauncherAgentRun = useCallback((entry: LauncherAgentRunEntry) => {
    setLauncherAgentRuns((prev) => [...prev, entry]);
  }, []);

  const patchLauncherAgentRun = useCallback(
    (id: string, patch: Partial<LauncherAgentRunEntry>) => {
      setLauncherAgentRuns((prev) =>
        prev.map((run) => (run.id === id ? { ...run, ...patch } : run)),
      );
    },
    [],
  );

  const clearLauncherAgentRuns = useCallback(() => {
    setLauncherAgentRuns([]);
  }, []);

  const appendLauncherResolveRun = useCallback((entry: LauncherResolveRunEntry) => {
    setLauncherResolveRuns((prev) => [...prev, entry]);
  }, []);

  const patchLauncherResolveRun = useCallback(
    (id: string, patch: Partial<LauncherResolveRunEntry>) => {
      setLauncherResolveRuns((prev) =>
        prev.map((run) => (run.id === id ? { ...run, ...patch } : run)),
      );
    },
    [],
  );

  const clearLauncherResolveRuns = useCallback(() => {
    setLauncherResolveRuns([]);
  }, []);

  const pingLabel = useMemo(() => {
    if (ping.status === "loading") return "RPC 检测中…";
    if (ping.status === "ok") return "RPC 正常";
    return ping.status === "error" ? `RPC 异常：${ping.message}` : "RPC";
  }, [ping]);

  const toolCoverage = useMemo(() => computeToolTestCoverage(), []);

  const handleOverrideChange = useCallback((key: string, json: string) => {
    setStepOverrides((prev) => ({ ...prev, [key]: json }));
  }, []);

  const patchToolSuiteRun = useCallback(
    (id: string, patch: Partial<ToolSuiteRunEntry>) => {
      setToolSuiteRuns((prev) =>
        prev.map((run) => (run.id === id ? { ...run, ...patch } : run)),
      );
    },
    [],
  );

  const clearToolSuiteRuns = useCallback(() => {
    setToolSuiteRuns([]);
  }, []);

  const scrollRunsEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = document.querySelector(".tool-test-title-stream");
      if (el instanceof HTMLElement) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, []);

  const syncSuiteRunMessages = useCallback(
    (runId: string, assistantId: string, parts: AgentUIMessage["parts"]) => {
      setToolSuiteRuns((prev) =>
        prev.map((run) => {
          if (run.id !== runId) return run;
          return {
            ...run,
            chatMessages: updateAssistantMessageParts(
              run.chatMessages,
              assistantId,
              parts,
            ),
          };
        }),
      );
    },
    [],
  );

  const requestApproval = useCallback(
    (suiteId: string, step: ToolTestStep, toolCallId: string) =>
      new Promise<boolean>((resolve) => {
        setPendingApproval({ suiteId, step, toolCallId, resolve });
      }),
    [],
  );

  const respondApproval = useCallback((approved: boolean) => {
    setPendingApproval((pending) => {
      if (pending) pending.resolve(approved);
      return null;
    });
  }, []);

  const runSuite = useCallback(
    async (suite: ToolTestSuite) => {
      if (runningSuiteId) return;
      setRunningSuiteId(suite.id);
      setLastError(null);

      const toolParts = suite.steps.map((step) => {
        const overrideKey = `${suite.id}:${step.id}`;
        const raw = resolveStepInputRaw(overrideKey, step, stepOverrides);
        let input: Record<string, unknown>;
        try {
          input = parseStepInputJson(raw, step.input);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`${step.label}: ${msg}`);
        }
        return createRunningToolPart(step.toolName, input);
      });

      let baseIndex = 0;
      let allParts: AgentUIMessage["parts"] = [];

      setToolSuiteRuns((prev) => {
        const existing = prev.find((r) => r.id === TOOL_TEST_SESSION_RUN_ID);
        const session = existing ?? createEmptyToolTestSession();
        const prior = getToolTestSessionParts(session);
        baseIndex = prior.length;
        allParts = [...prior, ...toolParts];
        const nextSession: ToolSuiteRunEntry = {
          ...session,
          at: existing ? session.at : Date.now(),
          status: "running",
          suiteTitle: suite.title,
          chatMessages: updateAssistantMessageParts(
            session.chatMessages,
            TOOL_TEST_SESSION_ASSISTANT_ID,
            allParts,
          ),
        };
        if (existing) {
          return prev.map((r) =>
            r.id === TOOL_TEST_SESSION_RUN_ID ? nextSession : r,
          );
        }
        return [...prev, nextSession];
      });
      scrollRunsEnd();

      let runFailed = false;

      try {
        for (let i = 0; i < suite.steps.length; i++) {
          const step = suite.steps[i]!;
          const part = toolParts[i]!;
          const toolCallId =
            "toolCallId" in part && typeof part.toolCallId === "string"
              ? part.toolCallId
              : generateId();

          const overrideKey = `${suite.id}:${step.id}`;
          const raw = resolveStepInputRaw(overrideKey, step, stepOverrides);
          const input = parseStepInputJson(raw, step.input);

          if (isShellToolName(step.toolName)) {
            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            });
          }

          let approved = false;
          let result = await callToolExecuteApi({
            toolName: step.toolName,
            input,
            workingDirectory: workingDirectory || undefined,
            toolCallId,
          });

          if ("needsApproval" in result) {
            const ok = await requestApproval(suite.id, step, toolCallId);
            if (!ok) {
              toolParts[i] = toolPartToError(part, "已取消执行");
              allParts[baseIndex + i] = toolParts[i]!;
              syncSuiteRunMessages(
                TOOL_TEST_SESSION_RUN_ID,
                TOOL_TEST_SESSION_ASSISTANT_ID,
                [...allParts],
              );
              scrollRunsEnd();
              continue;
            }
            approved = true;
            result = await callToolExecuteApi({
              toolName: step.toolName,
              input,
              workingDirectory: workingDirectory || undefined,
              approved,
              toolCallId,
            });
          }

          if ("ok" in result && result.ok) {
            toolParts[i] = toolPartToSuccess(part, result.output);
          } else if ("ok" in result && !result.ok) {
            if (step.optional) {
              toolParts[i] = toolPartToSuccess(part, {
                ok: false,
                optional: true,
                error: result.error,
              });
            } else {
              toolParts[i] = toolPartToError(part, result.error);
            }
          } else {
            toolParts[i] = toolPartToError(part, "未知执行结果");
          }

          allParts[baseIndex + i] = toolParts[i]!;
          syncSuiteRunMessages(
            TOOL_TEST_SESSION_RUN_ID,
            TOOL_TEST_SESSION_ASSISTANT_ID,
            [...allParts],
          );
          scrollRunsEnd();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLastError(msg);
        runFailed = true;
        patchToolSuiteRun(TOOL_TEST_SESSION_RUN_ID, { status: "error", error: msg });
      } finally {
        if (!runFailed) {
          patchToolSuiteRun(TOOL_TEST_SESSION_RUN_ID, { status: "done" });
        }
        setRunningSuiteId(null);
      }
    },
    [
      runningSuiteId,
      scrollRunsEnd,
      stepOverrides,
      requestApproval,
      workingDirectory,
      patchToolSuiteRun,
      syncSuiteRunMessages,
    ],
  );

  const runAllSuites = useCallback(async () => {
    if (runningSuiteId || runningAllSuites) return;
    setRunningAllSuites(true);
    setLastError(null);
    try {
      for (const suite of toolTestSuitesForRunAll()) {
        if (suite.requiresQkrpc && ping.status !== "ok") {
          continue;
        }
        await runSuite(suite);
      }
    } finally {
      setRunningAllSuites(false);
    }
  }, [runningAllSuites, runningSuiteId, runSuite, ping.status]);

  const clearConversation = useCallback(() => {
    clearToolSuiteRuns();
    setLastError(null);
  }, [clearToolSuiteRuns]);

  const busy = runningSuiteId !== null;
  const panelDisabled = busy || pendingApproval !== null;

  useEffect(() => {
    setSidebarTab(loadStoredToolTestSidebarTab());
  }, []);

  const handleSidebarTabChange = useCallback((tab: ToolTestSidebarTab) => {
    setSidebarTab(tab);
    storeToolTestSidebarTab(tab);
  }, []);

  const sidebarTabs = (
    <ToolTestSidebarTabs
      activeTab={sidebarTab}
      onTabChange={handleSidebarTabChange}
    />
  );

  const toolsPanelBusy = runningSuiteId !== null || runningAllSuites;
  const coveragePct = Math.round(toolCoverage.ratio * 100);

  const sidebarScroll =
    sidebarTab === "tools" ? (
      <>
        <div className="tool-test-tools-toolbar">
          <p className="tool-test-tools-coverage" title={`${toolCoverage.coveredToolIds.length} / ${toolCoverage.executableToolIds.length - toolCoverage.manualToolIds.length - toolCoverage.uiOnlyToolIds.length} 可自动覆盖`}>
            工具覆盖 <strong>{coveragePct}%</strong>
            <span className="tool-test-tools-coverage__meta">
              {toolCoverage.suiteCount} 套件 · {toolCoverage.stepCount} 步
            </span>
          </p>
          <button
            type="button"
            className="tool-test-tools-run-all"
            disabled={panelDisabled || toolsPanelBusy}
            onClick={() => void runAllSuites()}
          >
            {runningAllSuites ? "Running all…" : "Run all"}
          </button>
        </div>
        {TOOL_TEST_SUITES.map((suite) => (
          <ToolTestSuiteCard
            key={suite.id}
            suite={suite}
            runningSuiteId={runningSuiteId}
            onRun={runSuite}
            onShowDetail={setDetailSuite}
            disabled={panelDisabled || runningAllSuites}
          />
        ))}
        <ToolTestSuiteDetailDialog
          open={detailSuite !== null}
          suite={detailSuite}
          stepOverrides={stepOverrides}
          onOverrideChange={handleOverrideChange}
          disabled={panelDisabled}
          onClose={() => setDetailSuite(null)}
        />
      </>
    ) : sidebarTab === "prompt" ? (
      <ToolTestPromptPanel
        disabled={panelDisabled}
        workingDirectory={workingDirectory}
        onAppendRun={appendTitleTestRun}
        onPatchRun={patchTitleTestRun}
      />
    ) : sidebarTab === "prompt-chat" ? (
      <ToolTestPromptChatSidebar disabled={panelDisabled} />
    ) : sidebarTab === "launcher" ? (
      <ToolTestLauncherPanel
        subTab={launcherSubTab}
        onSubTabChange={setLauncherSubTab}
        disabled={panelDisabled}
        workingDirectory={workingDirectory}
        onAppendAgentRun={appendLauncherAgentRun}
        onPatchAgentRun={patchLauncherAgentRun}
        onAppendResolveRun={appendLauncherResolveRun}
        onPatchResolveRun={patchLauncherResolveRun}
        onAppendIntentRun={appendSettingsIntentRun}
        onPatchIntentRun={patchSettingsIntentRun}
        onLauncherAgentChatActionsReady={(actions) => {
          setLauncherAgentAddToolOutput(actions?.addToolOutput ?? null);
        }}
      />
    ) : sidebarTab === "action-trace" ? (
      <ToolTestActionTracePanel disabled={panelDisabled} />
    ) : sidebarTab === "action-runtime" ? (
      <ToolTestActionRuntimePanel
        disabled={panelDisabled}
        workingDirectory={workingDirectory}
        onAppendRun={appendActionRuntimeRun}
        onPatchRun={patchActionRuntimeRun}
      />
    ) : sidebarTab === "context-compression" ? (
      <ToolTestContextCompressionPanel
        disabled={panelDisabled}
        workingDirectory={workingDirectory}
        onAppendRun={appendContextCompressionRun}
        onPatchRun={patchContextCompressionRun}
      />
    ) : sidebarTab === "voice-input" ? (
      <ToolTestVoiceInputPanel
        disabled={panelDisabled}
        onAppendRun={appendVoiceInputRun}
        onPatchRun={patchVoiceInputRun}
      />
    ) : sidebarTab === "ask-question" ? (
      <ToolTestAskQuestionPanel
        activeScenarioId={activeAskQuestionScenario?.id ?? null}
        disabled={panelDisabled}
        onSelectScenario={setActiveAskQuestionScenario}
      />
    ) : sidebarTab === "llm-probe" ? (
      <ToolTestLlmProbePanel
        disabled={panelDisabled || llmProbeRunning}
        onReport={setLlmProbeReport}
        onError={setLlmProbeError}
        onRunningChange={setLlmProbeRunning}
      />
    ) : (
      <ToolTestAutoFixPanel
        disabled={panelDisabled}
        workingDirectory={workingDirectory}
        onAppendRun={appendAutoFixRun}
        onPatchRun={patchAutoFixRun}
      />
    );

  const mainPane =
    sidebarTab === "tools" ? (
      <ToolTestSuiteResultPane
        runs={toolSuiteRuns}
        workingDirectory={workingDirectory}
        onClearRuns={clearConversation}
      />
    ) : sidebarTab === "prompt" ? (
      <ToolTestTitleResultPane
        runs={titleTestRuns}
        workingDirectory={workingDirectory}
        onClearRuns={clearTitleTestRuns}
      />
    ) : sidebarTab === "prompt-chat" ? (
      <ToolTestPromptChatPane workingDirectory={workingDirectory} />
    ) : sidebarTab === "launcher" ? (
      <ToolTestLauncherResultPane
        subTab={launcherSubTab}
        agentRuns={launcherAgentRuns}
        resolveRuns={launcherResolveRuns}
        intentRuns={settingsIntentRuns}
        workingDirectory={workingDirectory}
        onClearAgentRuns={clearLauncherAgentRuns}
        onClearResolveRuns={clearLauncherResolveRuns}
        onClearIntentRuns={clearSettingsIntentRuns}
        launcherAgentAddToolOutput={launcherAgentAddToolOutput}
      />
    ) : sidebarTab === "action-trace" ? (
      <ToolTestActionTraceMain
        className="tool-test-action-trace-main"
        pingOk={ping.status === "ok"}
      />
    ) : sidebarTab === "action-runtime" ? (
      <ToolTestActionRuntimeResultPane
        runs={actionRuntimeRuns}
        workingDirectory={workingDirectory}
        onClearRuns={clearActionRuntimeRuns}
      />
    ) : sidebarTab === "context-compression" ? (
      <ToolTestContextCompressionResultPane
        runs={contextCompressionRuns}
        workingDirectory={workingDirectory}
        onClearRuns={clearContextCompressionRuns}
      />
    ) : sidebarTab === "voice-input" ? (
      <ToolTestVoiceInputResultPane
        runs={voiceInputRuns}
        onClearRuns={clearVoiceInputRuns}
      />
    ) : sidebarTab === "ask-question" ? (
      <ToolTestAskQuestionResultPane
        activeScenario={activeAskQuestionScenario}
        runs={askQuestionRuns}
        onClearRuns={clearAskQuestionRuns}
        onAppendRun={appendAskQuestionRun}
      />
    ) : sidebarTab === "llm-probe" ? (
      <ToolTestLlmProbeResultPane
        report={llmProbeReport}
        error={llmProbeError}
        running={llmProbeRunning}
        onClear={() => {
          setLlmProbeReport(null);
          setLlmProbeError(null);
        }}
      />
    ) : (
      <ToolTestAutoFixResultPane
        runs={autoFixRuns}
        workingDirectory={workingDirectory}
        onClearRuns={clearAutoFixRuns}
      />
    );

  return (
    <WorkspaceExplorerShellProvider>
    <WorkspaceExplorerPanelProvider
      cwd={workingDirectory}
      cwdPending={false}
    >
      <DocsViewerProvider>
        <div className="tool-test-page">
          <header className={titlebarClass}>
            <div className="tool-test-titlebar__row tool-test-titlebar__row--main">
              <TitlebarDragRegion className="tool-test-titlebar__drag" />
              <div className="tool-test-titlebar__left">
                <Link
                  href="/"
                  className="tool-test-back-btn"
                  title="返回聊天"
                  aria-label="返回聊天"
                >
                  <IconBackToChat />
                </Link>
                <span className="tool-test-titlebar__divider" aria-hidden />
                <span className="tool-test-titlebar__title">测试</span>
              </div>
              <TitlebarDragRegion className="tool-test-titlebar__main-spacer titlebar-drag-fill" />
              <div className="tool-test-titlebar__right">
                <TitlebarThemeSwitcher />
                {isDesktop ? <DesktopWindowControls /> : null}
              </div>
            </div>
            <div className="tool-test-titlebar__row tool-test-titlebar__row--meta">
              <span
                className="tool-test-versions"
                title={
                  protocolVersion
                    ? `QuickerAgent ${agentDisplayVersion} · qkrpc ${qkrpcDisplayVersion} · RPC 协议 ${protocolVersion}`
                    : `QuickerAgent ${agentDisplayVersion} · qkrpc ${qkrpcDisplayVersion}`
                }
              >
                <span className="tool-test-versions__item">
                  <span className="tool-test-versions__label">Agent</span>
                  <code className="tool-test-versions__value">
                    {agentDisplayVersion}
                  </code>
                </span>
                <span className="tool-test-versions__sep" aria-hidden>
                  ·
                </span>
                <span className="tool-test-versions__item">
                  <span className="tool-test-versions__label">qkrpc</span>
                  <code className="tool-test-versions__value">
                    {qkrpcDisplayVersion}
                  </code>
                </span>
                {protocolVersion ? (
                  <>
                    <span className="tool-test-versions__sep" aria-hidden>
                      ·
                    </span>
                    <span className="tool-test-versions__item">
                      <span className="tool-test-versions__label">协议</span>
                      <code className="tool-test-versions__value">
                        {protocolVersion}
                      </code>
                    </span>
                  </>
                ) : null}
              </span>
              <span className="tool-test-titlebar__meta-sep" aria-hidden />
              <span
                className={`tool-test-ping tool-test-ping--${ping.status}`}
                title={pingLabel}
              >
                {pingLabel}
              </span>
              <button
                type="button"
                className="tool-test-titlebar__btn"
                title="立即检测（约每 15 秒自动刷新）"
                disabled={ping.status === "loading"}
                onClick={() => void refreshPing({ silent: false, fast: true })}
              >
                刷新 RPC
              </button>
              <span className="tool-test-titlebar__meta-sep" aria-hidden />
              <button
                type="button"
                className="tool-test-titlebar__btn"
                title="跳过确认，强制走安装/下载流程（dev 下优先网络下载）"
                disabled={voiceInstallBusy}
                onClick={handleVoiceInstallTest}
              >
                {voiceInstallBusy ? "语音安装中…" : "测试语音安装"}
              </button>
              <span className="tool-test-titlebar__meta-sep" aria-hidden />
              {workingDirectory ? (
                <span className="tool-test-titlebar__cwd" title={workingDirectory}>
                  cwd: {workingDirectory}
                  {!store.workingDirectory.trim() && defaultCwd.trim()
                    ? " (默认)"
                    : ""}
                </span>
              ) : (
                <span className="tool-test-titlebar__cwd tool-test-titlebar__cwd--muted">
                  未设置工作目录（主聊天侧栏可配置）
                </span>
              )}
            </div>
          </header>

          {lastError && (
            <div className="tool-test-error" role="alert">
              {lastError}
            </div>
          )}

          {pendingApproval && (
            <div className="tool-test-approval" role="dialog" aria-modal="true">
              <p>
                工具 <code>{pendingApproval.step.toolName}</code> 需要确认：
                {pendingApproval.step.label}
              </p>
              <div className="tool-test-approval__actions">
                <button
                  type="button"
                  className="tool-test-approval__approve"
                  onClick={() => respondApproval(true)}
                >
                  确认执行
                </button>
                <button
                  type="button"
                  className="tool-test-approval__deny"
                  onClick={() => respondApproval(false)}
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <div className="tool-test-body">
            <nav className="tool-test-tab-rail" aria-label="测试类型">
              {sidebarTabs}
            </nav>
            {sidebarTab === "prompt-chat" ? (
              <ToolTestPromptChatProvider
                workingDirectory={workingDirectory}
                disabled={panelDisabled}
              >
                <aside className="tool-test-sidebar">
                  <div className="tool-test-sidebar-scroll">{sidebarScroll}</div>
                </aside>
                {mainPane}
              </ToolTestPromptChatProvider>
            ) : (
              <>
                <aside className="tool-test-sidebar">
                  <div className="tool-test-sidebar-scroll">{sidebarScroll}</div>
                </aside>
                {mainPane}
              </>
            )}
          </div>
        </div>
      </DocsViewerProvider>
    </WorkspaceExplorerPanelProvider>
    </WorkspaceExplorerShellProvider>
  );
}
