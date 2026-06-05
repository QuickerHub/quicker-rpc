"use client";

import { useEffect, useRef } from "react";
import type { ToolSuiteRunEntry } from "@/lib/tool-test-suite-runs";
import { ToolTestConversationCard } from "@/components/tool-test/ToolTestConversationCard";
import { ToolTestRunsPaneShell } from "@/components/tool-test/ToolTestRunsPaneShell";

type ToolTestSuiteResultPaneProps = {
  runs: ToolSuiteRunEntry[];
  workingDirectory?: string;
  keepToolBatchesExpanded?: boolean;
  onClearRuns: () => void;
};

function ToolSuiteRunCard({
  run,
  workingDirectory,
  keepToolBatchesExpanded,
}: {
  run: ToolSuiteRunEntry;
  workingDirectory?: string;
  keepToolBatchesExpanded?: boolean;
}) {
  const lastAssistant = run.chatMessages.find((m) => m.role === "assistant");
  const partCount = lastAssistant?.parts.length ?? 0;

  const footer =
    run.error || run.status === "done" ? (
      <dl className="tool-test-title-run__meta">
        <div>
          <dt>路径</dt>
          <dd>工具套件 · 逐步 execute</dd>
        </div>
        {run.error ? (
          <div>
            <dt>错误</dt>
            <dd className="tool-test-title-result__error">{run.error}</dd>
          </div>
        ) : null}
      </dl>
    ) : null;

  return (
    <ToolTestConversationCard
      label={run.suiteTitle}
      badgeTitle="工具套件"
      status={run.status}
      statusLabels={{ running: "执行中…" }}
      at={run.at}
      messages={run.chatMessages}
      workingDirectory={workingDirectory}
      keepToolBatchesExpanded={keepToolBatchesExpanded}
      emptyHint={
        run.status === "running" ? "正在逐步执行工具…" : undefined
      }
      streamTick={partCount}
      footer={footer}
    />
  );
}

export function ToolTestSuiteResultPane({
  runs,
  workingDirectory,
  keepToolBatchesExpanded,
  onClearRuns,
}: ToolTestSuiteResultPaneProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: runs.length > 1 ? "smooth" : "auto",
    });
  }, [
    runs.length,
    runs[runs.length - 1]?.status,
    runs[runs.length - 1]?.chatMessages.length,
  ]);

  const subText =
    runs.length === 0
      ? "左侧选一组工具并点「开始」"
      : `共 ${runs.length} 场对话 · 每场一次套件测试`;

  return (
    <ToolTestRunsPaneShell
      heading="工具对话"
      subText={subText}
      emptyText="每次「开始」都会在右侧新增一场对话：用户触发语 + 助手工具批次（与主聊天相同 UI）。清理时会删除对话里创建或编辑过的动作。"
      runs={runs}
      workingDirectory={workingDirectory}
      onClearRuns={onClearRuns}
      clearedLabel="已清空对话"
      streamAnchorRef={endRef}
    >
      {runs.map((run) => (
        <ToolSuiteRunCard
          key={run.id}
          run={run}
          workingDirectory={workingDirectory}
          keepToolBatchesExpanded={keepToolBatchesExpanded}
        />
      ))}
    </ToolTestRunsPaneShell>
  );
}
