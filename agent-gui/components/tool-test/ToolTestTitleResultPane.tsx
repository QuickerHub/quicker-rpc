"use client";

import { useEffect, useRef } from "react";
import { formatTokenCount } from "@/lib/chat-types";
import { isNearVerbatimThreadTitle } from "@/lib/thread-title";
import { extractThreadTitleFromMessages } from "@/lib/thread-title-tool-messages";
import type { TitleTestRunEntry } from "@/lib/tool-test-title-runs";
import { formatTitleTestRunTime } from "@/lib/tool-test-title-runs";
import { ToolTestChatMessages } from "@/components/tool-test/ToolTestChatMessages";
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
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messages = buildTitleTestDisplayMessages(run);
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

  useEffect(() => {
    if (run.status !== "running") return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, run.status]);

  return (
    <article
      className={`tool-test-title-run tool-test-title-run--embed${run.status === "running" ? " tool-test-title-run--running" : ""}`}
    >
      <header className="tool-test-title-run__head">
        <div className="tool-test-title-run__head-main">
          <span className="tool-test-title-run__case">{run.triggerLabel ?? "测试"}</span>
          <span className="tool-test-title-run__title-pill" title="set_thread_title">
            {generatedTitle}
          </span>
        </div>
        <time className="tool-test-title-run__time" dateTime={new Date(run.at).toISOString()}>
          {formatTitleTestRunTime(run.at)}
        </time>
      </header>

      <div className="tool-test-title-run__chat" aria-label="内嵌对话流">
        <ToolTestChatMessages
          messages={messages}
          workingDirectory={workingDirectory}
          keepToolBatchesExpanded
          emptyHint={
            run.status === "running" && !run.requestPayload?.trim() && !run.userText.trim()
              ? "等待 /api/chat 流式消息…"
              : undefined
          }
          endRef={chatEndRef}
        />
      </div>

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
    </article>
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

  return (
    <main className="tool-test-title-pane">
      <header className="tool-test-title-pane__head">
        <h2 className="tool-test-title-pane__heading">对话流记录</h2>
        <div className="tool-test-pane-toolbar">
          <p className="tool-test-title-pane__sub">
            {runs.length === 0
              ? "左侧选对话模型并点情景"
              : `共 ${runs.length} 次 · 内嵌真实 /api/chat 消息（set_thread_title 已隐藏）`}
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
            每次测试右侧会显示与主聊天相同的用户/助手消息与工具行；标题显示在卡片顶部。
          </p>
        ) : (
          runs.map((run) => (
            <TitleTestRunCard
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
