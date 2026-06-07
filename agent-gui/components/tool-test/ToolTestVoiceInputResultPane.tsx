"use client";

import type { VoiceInputRunEntry } from "@/lib/tool-test-voice-input-runs";
import { formatVoiceTimingRow } from "@/components/tool-test/ToolTestVoiceInputPanel";
import { ToolTestRunsPaneShell } from "@/components/tool-test/ToolTestRunsPaneShell";

type ToolTestVoiceInputResultPaneProps = {
  runs: VoiceInputRunEntry[];
  onClearRuns: () => void;
};

function TimingCard({ run }: { run: VoiceInputRunEntry }) {
  const timings = run.timings;

  if (run.status === "running") {
    return (
      <article className="voice-bench-run-card">
        <header className="voice-bench-run-card__header">
          <span className="voice-bench-run-card__label">{run.modeLabel}</span>
          <span className="voice-bench-run-card__badge">运行中</span>
        </header>
        <p className="voice-bench-run-card__hint">等待各阶段计时…</p>
      </article>
    );
  }

  if (run.status === "error" || !timings) {
    return (
      <article className="voice-bench-run-card">
        <header className="voice-bench-run-card__header">
          <span className="voice-bench-run-card__label">{run.modeLabel}</span>
          <span className="voice-bench-run-card__badge voice-bench-run-card__badge--err">
            失败
          </span>
        </header>
        <p className="tool-test-title-result__error">{run.error ?? "未知错误"}</p>
      </article>
    );
  }

  const rows = [
    formatVoiceTimingRow("麦克风就绪", timings.micGetUserMediaMs),
    formatVoiceTimingRow("首块 PCM", timings.micFirstChunkMs),
    formatVoiceTimingRow("WS 连接", timings.wsConnectMs),
    formatVoiceTimingRow("Session 就绪", timings.wsSessionStartMs),
    formatVoiceTimingRow("可发送音频", timings.setupCompleteMs),
    formatVoiceTimingRow("首条 partial", timings.firstPartialMs),
  ];

  const setupMs = timings.setupCompleteMs;
  const micFirstMs = timings.micFirstChunkMs;
  const gap =
    setupMs != null && micFirstMs != null
      ? Math.max(0, setupMs - micFirstMs)
      : null;

  return (
    <article className="voice-bench-run-card">
      <header className="voice-bench-run-card__header">
        <span className="voice-bench-run-card__label">{run.modeLabel}</span>
        <span className="voice-bench-run-card__badge voice-bench-run-card__badge--ok">
          完成
        </span>
      </header>

      <dl className="voice-bench-run-card__meta">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
        {timings.bufferedChunksBeforeReady > 0 ? (
          <div>
            <dt>WS 前缓冲</dt>
            <dd>
              {timings.bufferedChunksBeforeReady} 块 /{" "}
              {timings.bufferedBytesBeforeReady.toLocaleString()} B
            </dd>
          </div>
        ) : null}
        {gap != null && gap > 0 ? (
          <div>
            <dt>首块→可发送</dt>
            <dd>{gap} ms</dd>
          </div>
        ) : null}
        {timings.pcmBytesSent > 0 ? (
          <div>
            <dt>发送 PCM</dt>
            <dd>{timings.pcmBytesSent.toLocaleString()} B</dd>
          </div>
        ) : null}
      </dl>

      {timings.firstPartialText ? (
        <details className="voice-bench-run-card__details" open>
          <summary>首条识别</summary>
          <p className="voice-bench-run-card__partial">{timings.firstPartialText}</p>
        </details>
      ) : null}
    </article>
  );
}

export function ToolTestVoiceInputResultPane({
  runs,
  onClearRuns,
}: ToolTestVoiceInputResultPaneProps) {
  return (
    <ToolTestRunsPaneShell
      heading="语音启动延迟"
      subText="对比各阶段耗时；关注「首块 PCM」与「可发送音频」之间的差距。"
      emptyText="在左侧选择测试模式并运行。"
      runs={runs}
      onClearRuns={onClearRuns}
      cleanupDisabled
    >
      <div className="voice-bench-results">
        {[...runs].reverse().map((run) => (
          <TimingCard key={run.id} run={run} />
        ))}
      </div>
    </ToolTestRunsPaneShell>
  );
}
