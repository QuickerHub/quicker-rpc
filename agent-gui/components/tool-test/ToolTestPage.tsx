"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
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
import {
  TOOL_TEST_SUITES,
  type ToolTestStep,
  type ToolTestSuite,
} from "@/lib/tool-test-suites";
import {
  createRunningToolPart,
  createUserTestMessage,
  toolPartToError,
  toolPartToSuccess,
  updateAssistantMessageParts,
} from "@/lib/tool-test-parts";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import { TauriWindowControls } from "@/components/shell/TauriWindowControls";
import { TitlebarThemeSwitcher } from "@/components/chat/TitlebarThemeSwitcher";
import { useTauriShell } from "@/lib/tauri-shell";
import {
  loadToolTestKeepBatchesExpanded,
  storeToolTestKeepBatchesExpanded,
} from "@/lib/tool-test-ui-prefs";
import { defaultStepInputJson } from "@/lib/tool-test-input-format";
import { ToolTestPromptPanel } from "@/components/tool-test/ToolTestPromptPanel";
import { ToolTestSuiteDetailDialog } from "@/components/tool-test/ToolTestSuiteDetailDialog";
import { SHELL_EXEC_TOOL } from "@/lib/shell-tool-constants";
import { ToolTestTitleResultPane } from "@/components/tool-test/ToolTestTitleResultPane";
import type { TitleTestRunEntry } from "@/lib/tool-test-title-runs";
import { ToolTestAutoFixPanel } from "@/components/tool-test/ToolTestAutoFixPanel";
import { ToolTestAutoFixResultPane } from "@/components/tool-test/ToolTestAutoFixResultPane";
import {
  ToolTestLauncherPanel,
  type ToolTestLauncherSubTab,
} from "@/components/tool-test/ToolTestLauncherPanel";
import { ToolTestLauncherResultPane } from "@/components/tool-test/ToolTestLauncherResultPane";
import { ToolTestActionTracePanel } from "@/components/tool-test/ToolTestActionTracePanel";
import { ToolTestActionTraceMain } from "@/components/tool-test/ToolTestActionTraceMain";
import {
  ToolTestPromptChatPane,
  ToolTestPromptChatProvider,
  ToolTestPromptChatSidebar,
} from "@/components/tool-test/ToolTestPromptChatSection";
import { ToolTestSuiteResultPane } from "@/components/tool-test/ToolTestSuiteResultPane";
import type { ToolSuiteRunEntry } from "@/lib/tool-test-suite-runs";
import { createToolSuiteRunId } from "@/lib/tool-test-suite-runs";
import type { AutoFixRunEntry } from "@/lib/tool-test-autofix-runs";
import type { SettingsIntentRunEntry } from "@/lib/quicker-settings-intent-runs";
import type { LauncherAgentRunEntry } from "@/lib/tool-test-launcher-agent-runs";
import type { LauncherResolveRunEntry } from "@/lib/tool-test-launcher-resolve-runs";
import { requestVoicePluginSetup } from "@/lib/voice-input/voice-plugin-install-flow";

type ToolTestSidebarTab = "tools" | "prompt" | "prompt-chat" | "auto-fix" | "launcher" | "action-trace";

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

  return (
    <section className="tool-test-suite-card tool-test-suite-card--compact">
      <span className="tool-test-suite-card__label">{suite.title}</span>
      <div className="tool-test-suite-card__actions">
        <button
          type="button"
          className="tool-test-suite-card__detail"
          disabled={disabled}
          onClick={() => onShowDetail(suite)}
          aria-label={`${suite.title} 详情`}
        >
          详情
        </button>
        <button
          type="button"
          className="tool-test-suite-card__run"
          disabled={disabled || busy}
          onClick={() => onRun(suite)}
        >
          {busy ? "…" : "开始"}
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
  const isTauri = useTauriShell();

  const [toolSuiteRuns, setToolSuiteRuns] = useState<ToolSuiteRunEntry[]>([]);
  const [runningSuiteId, setRunningSuiteId] = useState<string | null>(null);
  const [stepOverrides, setStepOverrides] = useState<StepInputOverrides>({});
  const [keepToolBatchesExpanded, setKeepToolBatchesExpanded] = useState(
    () => loadToolTestKeepBatchesExpanded(),
  );
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(
    null,
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<ToolTestSidebarTab>("prompt-chat");
  const [titleTestRuns, setTitleTestRuns] = useState<TitleTestRunEntry[]>([]);
  const [autoFixRuns, setAutoFixRuns] = useState<AutoFixRunEntry[]>([]);
  const [launcherSubTab, setLauncherSubTab] = useState<ToolTestLauncherSubTab>("agent");
  const [launcherAgentRuns, setLauncherAgentRuns] = useState<LauncherAgentRunEntry[]>([]);
  const [launcherResolveRuns, setLauncherResolveRuns] = useState<LauncherResolveRunEntry[]>([]);
  const [settingsIntentRuns, setSettingsIntentRuns] = useState<SettingsIntentRunEntry[]>([]);
  const [detailSuite, setDetailSuite] = useState<ToolTestSuite | null>(null);
  const [voiceInstallBusy, setVoiceInstallBusy] = useState(false);

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

      const runId = createToolSuiteRunId();
      const userMsg = createUserTestMessage(`▶ 测试：${suite.title}`);
      const assistantId = generateId();
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

      const initialMessages: AgentUIMessage[] = [
        userMsg,
        { id: assistantId, role: "assistant", parts: toolParts },
      ];

      setToolSuiteRuns((prev) => [
        ...prev,
        {
          id: runId,
          at: Date.now(),
          suiteId: suite.id,
          suiteTitle: suite.title,
          status: "running",
          chatMessages: initialMessages,
        },
      ]);
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

          if (step.toolName === SHELL_EXEC_TOOL) {
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
              syncSuiteRunMessages(runId, assistantId, [...toolParts]);
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
            toolParts[i] = toolPartToError(part, result.error);
          } else {
            toolParts[i] = toolPartToError(part, "未知执行结果");
          }

          syncSuiteRunMessages(runId, assistantId, [...toolParts]);
          scrollRunsEnd();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLastError(msg);
        runFailed = true;
        patchToolSuiteRun(runId, { status: "error", error: msg });
      } finally {
        if (!runFailed) {
          patchToolSuiteRun(runId, { status: "done" });
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

  const clearConversation = useCallback(() => {
    clearToolSuiteRuns();
    setLastError(null);
  }, [clearToolSuiteRuns]);

  const busy = runningSuiteId !== null;
  const panelDisabled = busy || pendingApproval !== null;

  const sidebarTabs = (
    <div
      className="tool-test-sidebar-tabs"
      role="tablist"
      aria-label="测试类型"
    >
      <button
        type="button"
        role="tab"
        aria-selected={sidebarTab === "prompt-chat"}
        className={`tool-test-sidebar-tabs__btn${sidebarTab === "prompt-chat" ? " tool-test-sidebar-tabs__btn--active" : ""}`}
        onClick={() => setSidebarTab("prompt-chat")}
        title="Prompt 与多轮对话"
      >
        对话
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={sidebarTab === "tools"}
        className={`tool-test-sidebar-tabs__btn${sidebarTab === "tools" ? " tool-test-sidebar-tabs__btn--active" : ""}`}
        onClick={() => setSidebarTab("tools")}
        title="工具调用套件"
      >
        工具
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={sidebarTab === "prompt"}
        className={`tool-test-sidebar-tabs__btn${sidebarTab === "prompt" ? " tool-test-sidebar-tabs__btn--active" : ""}`}
        onClick={() => setSidebarTab("prompt")}
        title="set_thread_title 标题测试"
      >
        标题
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={sidebarTab === "launcher"}
        className={`tool-test-sidebar-tabs__btn${sidebarTab === "launcher" ? " tool-test-sidebar-tabs__btn--active" : ""}`}
        onClick={() => setSidebarTab("launcher")}
        title="启动器：Agent / Resolve / Intent"
      >
        启动器
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={sidebarTab === "action-trace"}
        className={`tool-test-sidebar-tabs__btn${sidebarTab === "action-trace" ? " tool-test-sidebar-tabs__btn--active" : ""}`}
        onClick={() => setSidebarTab("action-trace")}
        title="Action trace 流式调试"
      >
        Trace
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={sidebarTab === "auto-fix"}
        className={`tool-test-sidebar-tabs__btn${sidebarTab === "auto-fix" ? " tool-test-sidebar-tabs__btn--active" : ""}`}
        onClick={() => setSidebarTab("auto-fix")}
        title="造错→修复场景"
      >
        修复
      </button>
    </div>
  );

  const sidebarScroll =
    sidebarTab === "tools" ? (
      <>
        {TOOL_TEST_SUITES.map((suite) => (
          <ToolTestSuiteCard
            key={suite.id}
            suite={suite}
            runningSuiteId={runningSuiteId}
            onRun={runSuite}
            onShowDetail={setDetailSuite}
            disabled={panelDisabled}
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
      />
    ) : sidebarTab === "action-trace" ? (
      <ToolTestActionTracePanel disabled={panelDisabled} />
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
        keepToolBatchesExpanded={keepToolBatchesExpanded}
        onClearRuns={clearConversation}
      />
    ) : sidebarTab === "prompt" ? (
      <ToolTestTitleResultPane
        runs={titleTestRuns}
        workingDirectory={workingDirectory}
        onClearRuns={clearTitleTestRuns}
      />
    ) : sidebarTab === "prompt-chat" ? (
      <ToolTestPromptChatPane
        workingDirectory={workingDirectory}
        keepToolBatchesExpanded={keepToolBatchesExpanded}
      />
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
      />
    ) : sidebarTab === "action-trace" ? (
      <ToolTestActionTraceMain
        className="tool-test-action-trace-main"
        pingOk={ping.status === "ok"}
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
          <header className="tool-test-titlebar">
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
              <div className="tool-test-titlebar__main-spacer" aria-hidden />
              <div className="tool-test-titlebar__right">
                <label className="tool-test-titlebar__toggle">
                  <input
                    type="checkbox"
                    checked={keepToolBatchesExpanded}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setKeepToolBatchesExpanded(next);
                      storeToolTestKeepBatchesExpanded(next);
                    }}
                  />
                  <span>保持工具批次展开</span>
                </label>
                <TitlebarThemeSwitcher />
                {isTauri ? <TauriWindowControls /> : null}
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
            {sidebarTab === "prompt-chat" ? (
              <ToolTestPromptChatProvider
                workingDirectory={workingDirectory}
                disabled={panelDisabled}
              >
                <aside className="tool-test-sidebar">
                  {sidebarTabs}
                  <div className="tool-test-sidebar-scroll">{sidebarScroll}</div>
                </aside>
                {mainPane}
              </ToolTestPromptChatProvider>
            ) : (
              <>
                <aside className="tool-test-sidebar">
                  {sidebarTabs}
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
