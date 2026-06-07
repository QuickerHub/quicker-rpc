"use client";

import { getToolOrDynamicToolName, isToolOrDynamicToolUIPart } from "ai";
import { useEffect, useMemo, useRef } from "react";
import type { LauncherAgentRunEntry } from "@/lib/tool-test-launcher-agent-runs";
import type { ToolTestConversationStatus } from "@/lib/tool-test-conversation-run";
import {
  computeLauncherAgentResponseDurationMs,
  computeLauncherAgentStartupDurationMs,
  formatLauncherAgentTimingMs,
} from "@/lib/tool-test-launcher-agent-timing";
import { ToolTestConversationCard } from "@/components/tool-test/ToolTestConversationCard";
import { ToolTestRunsPaneShell } from "@/components/tool-test/ToolTestRunsPaneShell";

type ToolTestLauncherAgentResultPaneProps = {
  runs: LauncherAgentRunEntry[];
  workingDirectory?: string;
  onClearRuns: () => void;
};

function firstToolName(messages: LauncherAgentRunEntry["chatMessages"]): string | null {
  for (const msg of messages) {
    for (const part of msg.parts ?? []) {
      if (isToolOrDynamicToolUIPart(part)) {
        return getToolOrDynamicToolName(part);
      }
    }
  }
  return null;
}

function buildLauncherAgentTiming(run: LauncherAgentRunEntry) {
  const isLive = run.status === "running" && run.responseCompletedAt == null;
  const effectiveCompletedAt =
    run.responseCompletedAt
    ?? (isLive && run.responseStartedAt ? Date.now() : undefined);

  const responseMs = computeLauncherAgentResponseDurationMs({
    responseStartedAt: run.responseStartedAt,
    responseCompletedAt: effectiveCompletedAt,
  });
  const startupMs = computeLauncherAgentStartupDurationMs({
    runStartedAt: run.at,
    responseCompletedAt: effectiveCompletedAt,
  });
  const primaryMs =
    run.responseCompletionKind === "execution" || isLive
      ? startupMs
      : responseMs ?? startupMs;
  const detail =
    run.responseCompletionKind === "execution" && run.executionTool
      ? `触发 ${run.executionTool} · 首响应→执行 ${formatLauncherAgentTimingMs(
          computeLauncherAgentResponseDurationMs({
            responseStartedAt: run.responseStartedAt,
            responseCompletedAt: run.responseCompletedAt,
          }),
        )}`
      : isLive
        ? "等待触发执行工具…"
        : run.responseCompletionKind === "stream-end"
          ? "未触发执行工具，取流结束"
          : undefined;
  return { primaryMs, responseMs, startupMs, detail, isLive };
}

function isLauncherCacheDirectRun(
  messages: LauncherAgentRunEntry["chatMessages"],
): boolean {
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    if (msg.metadata?.launcherCacheDirect === true) return true;
    if (msg.metadata?.model === "launcher-cache") return true;
  }
  return false;
}

function isLauncherResolveDirectRun(
  messages: LauncherAgentRunEntry["chatMessages"],
): boolean {
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    if (msg.metadata?.launcherResolveDirect === true) return true;
    if (msg.metadata?.model === "launcher-resolve") return true;
  }
  return false;
}

function directRunLabel(
  messages: LauncherAgentRunEntry["chatMessages"],
): string | null {
  if (isLauncherCacheDirectRun(messages)) return "Cache 直连";
  if (isLauncherResolveDirectRun(messages)) return "Resolve 直连";
  return null;
}

function LauncherAgentRunCard({
  run,
  workingDirectory,
}: {
  run: LauncherAgentRunEntry;
  workingDirectory?: string;
}) {
  const firstTool = firstToolName(run.chatMessages);
  const directLabel = directRunLabel(run.chatMessages);
  const timing = buildLauncherAgentTiming(run);
  const footer = (
    <dl className="tool-test-title-run__meta">
      <div>
        <dt>模式</dt>
        <dd>
          {directLabel
            ? `Launcher · ${directLabel} · /api/chat`
            : "Launcher · Auto · /api/chat"}
        </dd>
      </div>
      <div>
        <dt>启动耗时</dt>
        <dd title={timing.detail}>
          {formatLauncherAgentTimingMs(timing.primaryMs)}
          {run.responseCompletionKind === "execution" ? (
            <span className="tool-test-launcher-timing__kind"> · 已执行</span>
          ) : null}
        </dd>
      </div>
      {timing.responseMs != null && run.responseCompletionKind === "execution" ? (
        <div>
          <dt>响应耗时</dt>
          <dd title="首字节 → 触发执行工具">
            {formatLauncherAgentTimingMs(timing.responseMs)}
          </dd>
        </div>
      ) : null}
      <div>
        <dt>Prompt</dt>
        <dd>
          <code>{run.userPrompt}</code>
        </dd>
      </div>
      {firstTool ? (
        <div>
          <dt>首个工具</dt>
          <dd>
            <code>{firstTool}</code>
          </dd>
        </div>
      ) : null}
      {run.error ? (
        <div>
          <dt>错误</dt>
          <dd className="tool-test-title-result__error">{run.error}</dd>
        </div>
      ) : null}
    </dl>
  );

  return (
    <ToolTestConversationCard
      label={run.scenarioLabel}
      badge={directLabel ?? run.llmModelLabel}
      badgeTitle={
        directLabel ? `Command/resolve · 无 LLM` : "Launcher Agent · Auto"
      }
      status={run.status}
      at={run.at}
      timingMs={timing.primaryMs}
      timingTitle={
        timing.detail
        ?? (run.responseCompletionKind === "execution"
          ? "请求发出 → 触发执行工具"
          : "请求发出 → 响应结束")
      }
      timingLive={timing.isLive}
      messages={run.chatMessages}
      workingDirectory={workingDirectory}
      emptyHint={
        run.status === "running" ? "等待 /api/chat 流式消息…" : undefined
      }
      streamTick={run.chatMessages[run.chatMessages.length - 1]?.parts.length ?? 0}
      chatVariant="launcher-agent"
      responseCompletionKind={run.responseCompletionKind}
      footer={footer}
    />
  );
}

export function ToolTestLauncherAgentResultPane({
  runs,
  workingDirectory,
  onClearRuns,
}: ToolTestLauncherAgentResultPaneProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: runs.length > 1 ? "smooth" : "auto",
    });
  }, [runs.length, runs[runs.length - 1]?.status, runs[runs.length - 1]?.chatMessages?.length]);

  const shellRuns = useMemo(
    () =>
      runs.map((run) => ({
        status: run.status as ToolTestConversationStatus,
        chatMessages: run.chatMessages,
      })),
    [runs],
  );

  return (
    <ToolTestRunsPaneShell
      heading="Launcher Agent"
      subText={
        runs.length === 0
          ? "左侧选场景并运行"
          : `${runs.length} 场 · chatMode=launcher · Auto`
      }
      emptyText="运行 Launcher Agent 后在此查看完整对话与工具调用。"
      runs={shellRuns}
      workingDirectory={workingDirectory}
      onClearRuns={onClearRuns}
      streamAnchorRef={endRef}
    >
      {runs.map((run) => (
        <LauncherAgentRunCard
          key={run.id}
          run={run}
          workingDirectory={workingDirectory}
        />
      ))}
    </ToolTestRunsPaneShell>
  );
}
