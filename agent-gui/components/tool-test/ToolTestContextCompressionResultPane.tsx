"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ContextCompressionRunEntry } from "@/lib/tool-test-context-compression-runs";
import type { ToolTestConversationStatus } from "@/lib/tool-test-conversation-run";
import { getLatestContextCompressionSummary } from "@/lib/context-length";
import { formatContextCompressionMetadata, hasReinjectBlock } from "@/lib/context-compression-metadata-display";
import { ToolTestConversationCard } from "@/components/tool-test/ToolTestConversationCard";
import { ToolTestRunsPaneShell } from "@/components/tool-test/ToolTestRunsPaneShell";

type ToolTestContextCompressionResultPaneProps = {
  runs: ContextCompressionRunEntry[];
  workingDirectory?: string;
  onClearRuns: () => void;
};

function formatRatio(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function DryRunCard({ run }: { run: ContextCompressionRunEntry }) {
  const dry = run.dryRun;
  if (!dry) {
    return (
      <article className="ctx-compression-run-card">
        <header className="ctx-compression-run-card__header">
          <span className="ctx-compression-run-card__label">{run.scenarioLabel}</span>
          <span className="ctx-compression-run-card__badge">Dry-run</span>
        </header>
        {run.error ? (
          <p className="tool-test-title-result__error">{run.error}</p>
        ) : (
          <p className="ctx-compression-run-card__hint">等待结果…</p>
        )}
      </article>
    );
  }

  const { preview } = dry;

  return (
    <article className="ctx-compression-run-card">
      <header className="ctx-compression-run-card__header">
        <span className="ctx-compression-run-card__label">{run.scenarioLabel}</span>
        <span
          className={`ctx-compression-run-card__badge${dry.compressed ? " ctx-compression-run-card__badge--ok" : ""}`}
        >
          {dry.compressed ? "已压缩" : "未压缩"}
        </span>
      </header>

      <dl className="ctx-compression-run-card__meta">
        <div>
          <dt>触发</dt>
          <dd>
            shouldCompress={String(preview.shouldCompress)}
            {preview.force ? " · force" : ""}
          </dd>
        </div>
        <div>
          <dt>分割</dt>
          <dd>
            {preview.splitReason} · older {preview.olderCount} · recent{" "}
            {preview.recentCount} · budget {preview.recentTokenBudget.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt>用量</dt>
          <dd>
            input {preview.latestInputTokens?.toLocaleString() ?? "—"} (
            {formatRatio(preview.usageRatio)}) · estimate{" "}
            {preview.estimatedTokens.toLocaleString()} ({formatRatio(preview.estimateRatio)})
          </dd>
        </div>
        <div>
          <dt>摘要</dt>
          <dd>
            {dry.reusedSummary
              ? "复用已有 summary"
              : dry.summarizeCalled
                ? "新 LLM 摘要"
                : dry.compressed
                  ? "—"
                  : "无"}
          </dd>
        </div>
        <div>
          <dt>压缩元数据</dt>
          <dd>{formatContextCompressionMetadata(dry.contextCompression)}</dd>
        </div>
        <div>
          <dt>模型消息</dt>
          <dd>{dry.modelMessageCount} 条</dd>
        </div>
      </dl>

      {dry.contextCompression?.reinjectPaths?.length ? (
        <p className="ctx-compression-run-card__hint">
          reinject: {dry.contextCompression.reinjectPaths.join(", ")}
          {hasReinjectBlock(dry.systemSuffix) ? " · 已写入 systemSuffix" : ""}
        </p>
      ) : null}

      {dry.summary ? (
        <details className="ctx-compression-run-card__details" open>
          <summary>Summary</summary>
          <pre className="ctx-compression-run-card__pre">{dry.summary}</pre>
        </details>
      ) : null}

      {dry.systemSuffix ? (
        <details className="ctx-compression-run-card__details">
          <summary>systemSuffix</summary>
          <pre className="ctx-compression-run-card__pre">{dry.systemSuffix}</pre>
        </details>
      ) : null}
    </article>
  );
}

function ChatRunCard({
  run,
  workingDirectory,
}: {
  run: ContextCompressionRunEntry;
  workingDirectory?: string;
}) {
  const messages = run.chatMessages ?? [];
  const compressionSummary = getLatestContextCompressionSummary(messages);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const compressionMeta = lastAssistant?.metadata?.contextCompression;

  const footer = (
    <dl className="tool-test-title-run__meta">
      <div>
        <dt>路径 / 模型</dt>
        <dd>
          生产 · /api/chat · {run.llmModelLabel}
        </dd>
      </div>
      <div>
        <dt>contextCompression</dt>
        <dd>
          {compressionMeta
            ? formatContextCompressionMetadata(compressionMeta)
            : compressionSummary ?? "（本轮未压缩）"}
        </dd>
      </div>
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
      badgeTitle="上下文压缩 · Chat"
      status={run.status === "running" ? "running" : run.status === "error" ? "error" : "done"}
      at={run.at}
      messages={messages}
      workingDirectory={workingDirectory}
      emptyHint={run.status === "running" ? "等待 /api/chat…" : undefined}
      streamTick={messages[messages.length - 1]?.parts.length ?? 0}
      footer={footer}
    />
  );
}

export function ToolTestContextCompressionResultPane({
  runs,
  workingDirectory,
  onClearRuns,
}: ToolTestContextCompressionResultPaneProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: runs.length > 1 ? "smooth" : "auto",
    });
  }, [runs.length, runs[runs.length - 1]?.status]);

  const subText =
    runs.length === 0
      ? "左侧选场景并 Dry-run 或 Chat"
      : `共 ${runs.length} 次运行`;

  const dryRuns = runs.filter((run) => run.mode === "dry-run");

  const shellRuns = useMemo(
    () =>
      runs.map((run) => ({
        status: (run.status === "running"
          ? "running"
          : run.status === "error"
            ? "error"
            : "done") as ToolTestConversationStatus,
        chatMessages: run.chatMessages ?? [],
      })),
    [runs],
  );

  return (
    <ToolTestRunsPaneShell
      heading="压缩结果"
      subText={subText}
      emptyText="Dry-run 查看 split / 摘要 / systemSuffix；Chat 模式验证生产 /api/chat 路径。"
      runs={shellRuns}
      workingDirectory={workingDirectory}
      onClearRuns={onClearRuns}
      streamAnchorRef={endRef}
    >
      {dryRuns.map((run) => (
        <DryRunCard key={run.id} run={run} />
      ))}
      {runs
        .filter((run) => run.mode === "chat")
        .map((run) => (
          <ChatRunCard key={run.id} run={run} workingDirectory={workingDirectory} />
        ))}
    </ToolTestRunsPaneShell>
  );
}
