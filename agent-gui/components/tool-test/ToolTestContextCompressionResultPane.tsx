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
        {dry.slidingWindowApplied != null ? (
          <div>
            <dt>滑动窗口</dt>
            <dd>{dry.slidingWindowApplied ? "已 trim 旧 turn 大 tool 输出" : "未触发"}</dd>
          </div>
        ) : null}
        {dry.historyArtifactPath ? (
          <div>
            <dt>历史归档</dt>
            <dd>{dry.historyArtifactPath}</dd>
          </div>
        ) : null}
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

function AgentViewRunCard({ run }: { run: ContextCompressionRunEntry }) {
  const view = run.agentView;

  return (
    <article className="ctx-compression-run-card">
      <header className="ctx-compression-run-card__header">
        <span className="ctx-compression-run-card__label">{run.scenarioLabel}</span>
        <span className="ctx-compression-run-card__badge">L1 工具压缩</span>
      </header>
      {run.status === "running" && !view ? (
        <p className="ctx-compression-run-card__hint">运行中…</p>
      ) : null}
      {run.error ? (
        <p className="tool-test-title-result__error">{run.error}</p>
      ) : null}
      {view ? (
        <>
          <dl className="ctx-compression-run-card__meta">
            <div>
              <dt>体积</dt>
              <dd>
                {view.beforeChars.toLocaleString()} → {view.afterChars.toLocaleString()} chars
                {" "}
                (−{view.savedChars.toLocaleString()})
              </dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>
                {view.compressionEnabled === false
                  ? "未裁剪（直通）"
                  : view.compressed
                    ? "已压缩"
                    : "未压缩"}
              </dd>
            </div>
            {view.summary ? (
              <div>
                <dt>摘要</dt>
                <dd>{view.summary}</dd>
              </div>
            ) : null}
            {view.modelTokens != null ? (
              <div>
                <dt>模型</dt>
                <dd>~{view.modelTokens.toLocaleString()} tok</dd>
              </div>
            ) : null}
            {view.nextAction ? (
              <div>
                <dt>续读</dt>
                <dd>{view.nextAction}</dd>
              </div>
            ) : null}
          </dl>
          {view.modelPayloadJson ? (
            <details className="ctx-compression-panel__agent-view-output">
              <summary>模型可见 payload</summary>
              <pre className="tool-json">{view.modelPayloadJson}</pre>
            </details>
          ) : null}
        </>
      ) : null}
    </article>
  );
}

function HarnessRunCard({ run }: { run: ContextCompressionRunEntry }) {
  const harness = run.harness;

  return (
    <article className="ctx-compression-run-card">
      <header className="ctx-compression-run-card__header">
        <span className="ctx-compression-run-card__label">{run.scenarioLabel}</span>
        <span className="ctx-compression-run-card__badge">Harness</span>
      </header>
      {run.status === "running" && !harness ? (
        <p className="ctx-compression-run-card__hint">运行中…</p>
      ) : null}
      {run.error ? (
        <p className="tool-test-title-result__error">{run.error}</p>
      ) : null}
      {harness?.kind === "sliding-window" ? (
        <dl className="ctx-compression-run-card__meta">
          <div>
            <dt>体积</dt>
            <dd>
              {harness.beforeChars?.toLocaleString() ?? "—"} →{" "}
              {harness.afterChars?.toLocaleString() ?? "—"} chars
              {" "}
              (−{harness.savedChars?.toLocaleString() ?? "—"})
            </dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{harness.applied ? "已 trim" : "未触发"}</dd>
          </div>
          <div>
            <dt>校验</dt>
            <dd>
              旧 turn preview={String(harness.oldTurnPreviewed)} · 近 turn 全量=
              {String(harness.recentTurnFull)}
            </dd>
          </div>
          <div>
            <dt>估算节省</dt>
            <dd>~{harness.tokensSavedEstimate?.toLocaleString() ?? "—"} tok</dd>
          </div>
        </dl>
      ) : null}
      {harness?.kind === "shell-artifact" ? (
        <>
          <dl className="ctx-compression-run-card__meta">
            <div>
              <dt>输出</dt>
              <dd>{harness.totalOutputChars?.toLocaleString() ?? "—"} chars</dd>
            </div>
            <div>
              <dt>模型 payload</dt>
              <dd>
                {harness.modelPayloadChars?.toLocaleString() ?? "—"} chars
                {" "}
                (displayData {harness.displayDataChars?.toLocaleString() ?? "—"})
              </dd>
            </div>
            {harness.artifactPath ? (
              <div>
                <dt>Artifact</dt>
                <dd>{harness.artifactPath}</dd>
              </div>
            ) : null}
            {harness.readHint ? (
              <div>
                <dt>Read hint</dt>
                <dd>{harness.readHint}</dd>
              </div>
            ) : null}
          </dl>
          {harness.modelPayloadJson ? (
            <details className="ctx-compression-panel__agent-view-output">
              <summary>模型可见 payload</summary>
              <pre className="tool-json">{harness.modelPayloadJson}</pre>
            </details>
          ) : null}
        </>
      ) : null}
      {harness?.kind === "list-tools-routing" ? (
        <dl className="ctx-compression-run-card__meta">
          <div>
            <dt>System routing</dt>
            <dd>{harness.compactPromptChars?.toLocaleString() ?? "—"} chars</dd>
          </div>
          <div>
            <dt>Core 内联</dt>
            <dd>{harness.coreRoutingChars?.toLocaleString() ?? "—"} chars</dd>
          </div>
          <div>
            <dt>list_tools 全表</dt>
            <dd>{harness.fullRoutingTableChars?.toLocaleString() ?? "—"} chars</dd>
          </div>
          <div>
            <dt>节省</dt>
            <dd>
              −{harness.savedVsFull?.toLocaleString() ?? "—"} chars (
              {harness.savingsPercent ?? "—"}%)
            </dd>
          </div>
        </dl>
      ) : null}
      {harness?.kind === "static-shell" ? (
        <>
          <dl className="ctx-compression-run-card__meta">
            <div>
              <dt>System</dt>
              <dd>
                {harness.systemPromptTokens?.toLocaleString() ?? "—"} tok
                {" "}
                ({harness.systemWithinTarget ? "≤ target" : "OVER target"})
              </dd>
            </div>
            <div>
              <dt>Tools</dt>
              <dd>
                {harness.toolDefinitionTokens?.toLocaleString() ?? "—"} tok
                {harness.toolDefinitionTokensFull != null ? (
                  <>
                    {" "}
                    (full {harness.toolDefinitionTokensFull.toLocaleString()} tok
                    {harness.slimExtendedToolCount != null
                      ? `, ${harness.slimExtendedToolCount} slimmed`
                      : ""}
                    )
                  </>
                ) : null}
                {" "}
                · {harness.toolCount ?? "—"} 个
              </dd>
            </div>
            <div>
              <dt>Total static</dt>
              <dd>{harness.totalStaticTokens?.toLocaleString() ?? "—"} tok</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>
                system ≤ {harness.targetSystemTokens?.toLocaleString() ?? "8,000"} tok
              </dd>
            </div>
          </dl>
          {harness.staticSegments?.length ? (
            <details className="ctx-compression-run-card__details" open>
              <summary>分段</summary>
              <ul className="ctx-compression-run-card__segment-list">
                {harness.staticSegments.map((segment) => (
                  <li key={segment.label}>
                    {segment.label}: {segment.tokens.toLocaleString()} tok
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
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
      ? "左侧选 L2 场景 Dry-run / Chat，或点击 L1 / Harness 场景即运行"
      : `共 ${runs.length} 次运行`;

  const dryRuns = runs.filter((run) => run.mode === "dry-run");
  const agentViewRuns = runs.filter((run) => run.mode === "agent-view");
  const harnessRuns = runs.filter((run) => run.mode === "harness");

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
      emptyText="L1 / Harness：点击场景即运行；L2：Dry-run 查看 split / 摘要，Chat 验证 /api/chat。"
      runs={shellRuns}
      workingDirectory={workingDirectory}
      onClearRuns={onClearRuns}
      streamAnchorRef={endRef}
    >
      {harnessRuns.map((run) => (
        <HarnessRunCard key={run.id} run={run} />
      ))}
      {agentViewRuns.map((run) => (
        <AgentViewRunCard key={run.id} run={run} />
      ))}
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
