"use client";

import { useCallback, useEffect, useRef } from "react";
import { formatTokenCount } from "@/lib/chat-types";
import { isNearVerbatimThreadTitle } from "@/lib/thread-title";
import { extractThreadTitleFromMessages } from "@/lib/thread-title-tool-messages";
import type { TitleTestRunEntry } from "@/lib/tool-test-title-runs";
import { ToolTestConversationCard } from "@/components/tool-test/ToolTestConversationCard";
import { ToolTestRunsPaneShell } from "@/components/tool-test/ToolTestRunsPaneShell";
import { buildTitleTestDisplayMessages } from "@/lib/tool-test-title-display";

type ToolTestTitleResultPaneProps = {
  runs: TitleTestRunEntry[];
  workingDirectory?: string;
  onClearRuns: () => void;
};

function formatUsageLine(run: TitleTestRunEntry): string | null {
  if (run.status === "running") return null;
  const u = run.result?.usage;
  if (!u) {
    if (run.result?.error) return null;
    return "未返回 usage";
  }
  return `输入 ${formatTokenCount(u.inputTokens)} · 输出 ${formatTokenCount(u.outputTokens)} · 合计 ${formatTokenCount(u.totalTokens)}`;
}

function TitleTestRunCard({
  run,
  workingDirectory,
}: {
  run: TitleTestRunEntry;
  workingDirectory?: string;
}) {
  const messages = buildTitleTestDisplayMessages(run);
  const liveMessageCount = run.chatMessages?.length ?? 0;
  const liveLastPartCount =
    run.chatMessages?.[liveMessageCount - 1]?.parts.length ?? 0;
  const titleFromTool = extractThreadTitleFromMessages(run.chatMessages ?? []);
  const generatedTitle =
    run.status === "running"
      ? (titleFromTool ?? "（流式中…）")
      : (run.result?.title ?? titleFromTool ?? "—");
  const usageLine = formatUsageLine(run);
  const echoesUser =
    run.status === "done"
    && generatedTitle
    && generatedTitle !== "—"
    && isNearVerbatimThreadTitle(generatedTitle, run.userText.trim());

  const footer = (
    <>
      {usageLine ? (
        <p className="tool-test-title-run__tokens">{usageLine}</p>
      ) : null}
      <dl className="tool-test-title-run__meta">
        <div>
          <dt>路径 / 模型</dt>
          <dd>
            {run.result?.source === "chat" ? "生产 · /api/chat 流式" : run.result?.source ?? "—"}
            {" · "}
            {run.result?.modelId
              ? `${run.llmModelLabel} (${run.result.modelId})`
              : run.llmModelLabel}
          </dd>
        </div>
        <div>
          <dt>生产本地参考</dt>
          <dd>
            <code>{run.localReference}</code>
          </dd>
        </div>
        {echoesUser ? (
          <div>
            <dt>提示</dt>
            <dd className="tool-test-title-run__echo-warn">
              标题与首句用户话几乎相同
            </dd>
          </div>
        ) : null}
        {run.result?.warning ? (
          <div>
            <dt>状态</dt>
            <dd>{run.result.warning}</dd>
          </div>
        ) : null}
        {run.result?.error ? (
          <div>
            <dt>错误</dt>
            <dd className="tool-test-title-result__error">{run.result.error}</dd>
          </div>
        ) : null}
      </dl>
    </>
  );

  return (
    <ToolTestConversationCard
      label={run.triggerLabel ?? "标题测试"}
      badge={generatedTitle}
      badgeTitle="set_thread_title"
      status={run.status}
      statusLabels={{ running: "（流式中…）" }}
      at={run.at}
      messages={messages}
      workingDirectory={workingDirectory}
      emptyHint={
        run.status === "running" && !run.requestPayload?.trim() && !run.userText.trim()
          ? "等待 /api/chat 流式消息…"
          : undefined
      }
      streamTick={liveLastPartCount + liveMessageCount}
      footer={footer}
    />
  );
}

export function ToolTestTitleResultPane({
  runs,
  workingDirectory,
  onClearRuns,
}: ToolTestTitleResultPaneProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: runs.length > 1 ? "smooth" : "auto" });
  }, [runs.length, runs[runs.length - 1]?.status, runs[runs.length - 1]?.chatMessages?.length]);

  const subText =
    runs.length === 0
      ? "左侧选对话模型并点情景"
      : `共 ${runs.length} 场对话 · /api/chat（set_thread_title 已隐藏）`;

  return (
    <ToolTestRunsPaneShell
      heading="标题对话"
      subText={subText}
      emptyText="每次情景会在右侧新增一场对话；标题显示在卡片顶栏。清理时会尝试删除对话里创建或编辑过的动作。"
      runs={runs}
      workingDirectory={workingDirectory}
      onClearRuns={onClearRuns}
      streamAnchorRef={endRef}
    >
      {runs.map((run) => (
        <TitleTestRunCard
          key={run.id}
          run={run}
          workingDirectory={workingDirectory}
        />
      ))}
    </ToolTestRunsPaneShell>
  );
}
