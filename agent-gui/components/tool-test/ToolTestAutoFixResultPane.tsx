"use client";

import { useEffect, useMemo, useRef } from "react";
import type { AutoFixRunEntry } from "@/lib/tool-test-autofix-runs";
import type { ToolTestConversationStatus } from "@/lib/tool-test-conversation-run";
import { ToolTestConversationCard } from "@/components/tool-test/ToolTestConversationCard";
import { ToolTestRunsPaneShell } from "@/components/tool-test/ToolTestRunsPaneShell";

type ToolTestAutoFixResultPaneProps = {
  runs: AutoFixRunEntry[];
  workingDirectory?: string;
  onClearRuns: () => void;
};

function AutoFixRunCard({
  run,
  workingDirectory,
}: {
  run: AutoFixRunEntry;
  workingDirectory?: string;
}) {
  const partCount =
    run.chatMessages[run.chatMessages.length - 1]?.parts.length ?? 0;

  const footer = (
    <dl className="tool-test-title-run__meta">
      <div>
        <dt>路径 / 模型</dt>
        <dd>
          生产 · /api/chat 流式{" · "}
          {run.result?.modelId
            ? `${run.llmModelLabel} (${run.result.modelId})`
            : run.llmModelLabel}
        </dd>
      </div>
      {run.result?.error ? (
        <div>
          <dt>错误</dt>
          <dd className="tool-test-title-result__error">{run.result.error}</dd>
        </div>
      ) : null}
    </dl>
  );

  return (
    <ToolTestConversationCard
      label={run.scenarioLabel}
      badgeTitle="自动修复场景"
      status={run.status === "idle" ? "done" : run.status}
      at={run.at}
      messages={run.chatMessages}
      workingDirectory={workingDirectory}
      emptyHint={
        run.status === "running" && !run.requestPayload?.trim()
          ? "等待 /api/chat 流式消息…"
          : undefined
      }
      streamTick={partCount}
      footer={footer}
    />
  );
}

export function ToolTestAutoFixResultPane({
  runs,
  workingDirectory,
  onClearRuns,
}: ToolTestAutoFixResultPaneProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: runs.length > 1 ? "smooth" : "auto",
    });
  }, [runs.length, runs[runs.length - 1]?.status, runs[runs.length - 1]?.chatMessages?.length]);

  const subText =
    runs.length === 0
      ? "左侧选场景并运行"
      : `共 ${runs.length} 场对话 · 造错→修复链路`;

  const shellRuns = useMemo(
    () =>
      runs.map((run) => ({
        status: (run.status === "idle" ? "done" : run.status) as ToolTestConversationStatus,
        chatMessages: run.chatMessages,
      })),
    [runs],
  );

  return (
    <ToolTestRunsPaneShell
      heading="修复对话"
      subText={subText}
      emptyText="每次「运行场景」都会在右侧新增一场完整 /api/chat 对话。清理时会尝试删除对话里创建或编辑过的动作。"
      runs={shellRuns}
      workingDirectory={workingDirectory}
      onClearRuns={onClearRuns}
      streamAnchorRef={endRef}
    >
      {runs.map((run) => (
        <AutoFixRunCard
          key={run.id}
          run={run}
          workingDirectory={workingDirectory}
        />
      ))}
    </ToolTestRunsPaneShell>
  );
}
