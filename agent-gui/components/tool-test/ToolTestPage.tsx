"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { generateId } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { ToolTestChatMessages } from "@/components/tool-test/ToolTestChatMessages";
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
  createAssistantToolMessage,
  createRunningToolPart,
  createUserTestMessage,
  toolPartToError,
  toolPartToSuccess,
  updateAssistantMessageParts,
} from "@/lib/tool-test-parts";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import { TauriWindowControls } from "@/components/shell/TauriWindowControls";
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

type ToolTestSidebarTab = "tools" | "prompt";

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

function ToolTestConversation({
  messages,
  workingDirectory,
  keepToolBatchesExpanded,
  onClearConversation,
  clearDisabled,
}: {
  messages: AgentUIMessage[];
  workingDirectory: string;
  keepToolBatchesExpanded: boolean;
  onClearConversation: () => void;
  clearDisabled?: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  return (
    <main className="tool-test-conversation messages">
      {messages.length > 0 ? (
        <div className="tool-test-pane-toolbar tool-test-pane-toolbar--sticky">
          <span className="tool-test-pane-toolbar__hint">
            {messages.length} 条工具调用消息
          </span>
          <button
            type="button"
            className="tool-test-pane-toolbar__action"
            disabled={clearDisabled}
            onClick={onClearConversation}
          >
            清空对话
          </button>
        </div>
      ) : null}
      {messages.length === 0 ? (
        <p className="tool-test-conversation__empty">
          选择左侧一组工具调用并点击「开始测试」，结果会以对话流形式展示（与主聊天相同的工具行 UI）。
        </p>
      ) : (
        <div className="tool-test-conversation__body">
          <ToolTestChatMessages
            messages={messages}
            workingDirectory={workingDirectory}
            keepToolBatchesExpanded={keepToolBatchesExpanded}
          />
        </div>
      )}
      <div ref={endRef} className="messages-anchor" aria-hidden />
    </main>
  );
}

export function ToolTestPage() {
  const { store } = useChatStore();
  const workingDirectory = store.workingDirectory.trim();
  const { ping, refreshPing, connectTick } = useQkrpcPing();
  const { agentDisplayVersion, qkrpcDisplayVersion } =
    useAppVersionSnapshot(connectTick);
  const protocolVersion = extractProtocolVersionFromPing(ping);
  const isTauri = useTauriShell();

  const [messages, setMessages] = useState<AgentUIMessage[]>([]);
  const [runningSuiteId, setRunningSuiteId] = useState<string | null>(null);
  const [stepOverrides, setStepOverrides] = useState<StepInputOverrides>({});
  const [keepToolBatchesExpanded, setKeepToolBatchesExpanded] = useState(
    () => loadToolTestKeepBatchesExpanded(),
  );
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(
    null,
  );
  const [lastError, setLastError] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<ToolTestSidebarTab>("tools");
  const [titleTestRuns, setTitleTestRuns] = useState<TitleTestRunEntry[]>([]);
  const [detailSuite, setDetailSuite] = useState<ToolTestSuite | null>(null);

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

  const pingLabel = useMemo(() => {
    if (ping.status === "loading") return "RPC 检测中…";
    if (ping.status === "ok") return "RPC 正常";
    return ping.status === "error" ? `RPC 异常：${ping.message}` : "RPC";
  }, [ping]);

  const handleOverrideChange = useCallback((key: string, json: string) => {
    setStepOverrides((prev) => ({ ...prev, [key]: json }));
  }, []);

  const scrollConversationEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = document.querySelector(".tool-test-conversation");
      if (el instanceof HTMLElement) {
        el.scrollTop = el.scrollHeight;
      }
    });
  }, []);

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

      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", parts: toolParts },
      ]);
      scrollConversationEnd();

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
              setMessages((prev) =>
                updateAssistantMessageParts(prev, assistantId, [...toolParts]),
              );
              scrollConversationEnd();
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

          setMessages((prev) =>
            updateAssistantMessageParts(prev, assistantId, [...toolParts]),
          );
          scrollConversationEnd();
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLastError(msg);
      } finally {
        setRunningSuiteId(null);
      }
    },
    [
      runningSuiteId,
      scrollConversationEnd,
      stepOverrides,
      requestApproval,
      workingDirectory,
    ],
  );

  const clearConversation = useCallback(() => {
    setMessages([]);
    setLastError(null);
  }, []);

  const busy = runningSuiteId !== null;

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
              {workingDirectory ? (
                <span className="tool-test-titlebar__cwd" title={workingDirectory}>
                  cwd: {workingDirectory}
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
            <aside className="tool-test-sidebar">
              <div
                className="tool-test-sidebar-tabs"
                role="tablist"
                aria-label="测试类型"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={sidebarTab === "tools"}
                  className={`tool-test-sidebar-tabs__btn${sidebarTab === "tools" ? " tool-test-sidebar-tabs__btn--active" : ""}`}
                  onClick={() => setSidebarTab("tools")}
                >
                  工具套件
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={sidebarTab === "prompt"}
                  className={`tool-test-sidebar-tabs__btn${sidebarTab === "prompt" ? " tool-test-sidebar-tabs__btn--active" : ""}`}
                  onClick={() => setSidebarTab("prompt")}
                >
                  对话标题
                </button>
              </div>

              <div className="tool-test-sidebar-scroll">
                {sidebarTab === "tools" ? (
                  <>
                    {TOOL_TEST_SUITES.map((suite) => (
                      <ToolTestSuiteCard
                        key={suite.id}
                        suite={suite}
                        runningSuiteId={runningSuiteId}
                        onRun={runSuite}
                        onShowDetail={setDetailSuite}
                        disabled={busy || pendingApproval !== null}
                      />
                    ))}
                    <ToolTestSuiteDetailDialog
                      open={detailSuite !== null}
                      suite={detailSuite}
                      stepOverrides={stepOverrides}
                      onOverrideChange={handleOverrideChange}
                      disabled={busy || pendingApproval !== null}
                      onClose={() => setDetailSuite(null)}
                    />
                  </>
                ) : (
                  <ToolTestPromptPanel
                    disabled={busy || pendingApproval !== null}
                    onAppendRun={appendTitleTestRun}
                    onPatchRun={patchTitleTestRun}
                  />
                )}
              </div>
            </aside>
            {sidebarTab === "tools" ? (
              <ToolTestConversation
                messages={messages}
                workingDirectory={workingDirectory}
                keepToolBatchesExpanded={keepToolBatchesExpanded}
                onClearConversation={clearConversation}
                clearDisabled={busy}
              />
            ) : (
              <ToolTestTitleResultPane
                runs={titleTestRuns}
                workingDirectory={workingDirectory}
                onClearRuns={clearTitleTestRuns}
              />
            )}
          </div>
        </div>
      </DocsViewerProvider>
    </WorkspaceExplorerPanelProvider>
    </WorkspaceExplorerShellProvider>
  );
}
