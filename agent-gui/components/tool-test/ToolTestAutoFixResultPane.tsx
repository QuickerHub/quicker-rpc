"use client";

import { useEffect, useRef } from "react";
import type { AutoFixRunEntry } from "@/lib/tool-test-autofix-runs";
import { formatAutoFixRunTime } from "@/lib/tool-test-autofix-runs";
import { ToolTestChatMessages } from "@/components/tool-test/ToolTestChatMessages";

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
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (run.status !== "running") return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [run.status, run.chatMessages.length]);

  return (
    <article
      className={`tool-test-title-run tool-test-title-run--embed${run.status === "running" ? " tool-test-title-run--running" : ""}`}
    >
      <header className="tool-test-title-run__head">
        <div className="tool-test-title-run__head-main">
          <span className="tool-test-title-run__case">{run.scenarioLabel}</span>
          <span className="tool-test-title-run__title-pill" title="自动修复场景">
            {run.status === "running"
              ? "（流式中…）"
              : run.status === "done"
                ? "完成"
                : run.status === "error"
                  ? "失败"
                  : "—"}
          </span>
        </div>
        <time
          className="tool-test-title-run__time"
          dateTime={new Date(run.at).toISOString()}
        >
          {formatAutoFixRunTime(run.at)}
        </time>
      </header>

      <div className="tool-test-title-run__chat" aria-label="内嵌对话流">
        <ToolTestChatMessages
          messages={run.chatMessages}
          workingDirectory={workingDirectory}
          keepToolBatchesExpanded
          emptyHint={
            run.status === "running" && !run.requestPayload?.trim()
              ? "等待 /api/chat 流式消息…"
              : undefined
          }
          endRef={chatEndRef}
        />
      </div>

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
    </article>
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

  return (
    <main className="tool-test-title-pane">
      <header className="tool-test-title-pane__head">
        <h2 className="tool-test-title-pane__heading">自动修复记录</h2>
        <div className="tool-test-pane-toolbar">
          <p className="tool-test-title-pane__sub">
            {runs.length === 0 ? "左侧选场景并运行" : `共 ${runs.length} 次 · 内嵌真实 /api/chat 消息`}
          </p>
          {runs.length > 0 ? (
            <button
              type="button"
              className="tool-test-pane-toolbar__action"
              onClick={onClearRuns}
            >
              清空记录
            </button>
          ) : null}
        </div>
      </header>

      <div className="tool-test-title-stream">
        {runs.length === 0 ? (
          <p className="tool-test-title-pane__empty">
            每次场景会展示与主聊天相同的用户/助手消息与工具行；用于复现“造错→修复→再检查”的完整链路。
          </p>
        ) : (
          runs.map((run) => (
            <AutoFixRunCard
              key={run.id}
              run={run}
              workingDirectory={workingDirectory}
            />
          ))
        )}
        <div ref={endRef} className="tool-test-title-stream__anchor" aria-hidden />
      </div>
    </main>
  );
}

