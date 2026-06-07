"use client";

import { useEffect, useRef } from "react";
import type { SettingsIntentCheckResult } from "@/lib/quicker-settings-intent-check";
import {
  formatSettingsIntentRunTime,
  type SettingsIntentRunEntry,
} from "@/lib/quicker-settings-intent-runs";
import { ToolTestRunsPaneShell } from "@/components/tool-test/ToolTestRunsPaneShell";

type ToolTestSettingsIntentResultPaneProps = {
  runs: SettingsIntentRunEntry[];
  onClearRuns: () => void;
};

function ResultRow({ result }: { result: SettingsIntentCheckResult }) {
  return (
    <li
      className={`tool-test-settings-intent-result${result.pass ? " tool-test-settings-intent-result--pass" : " tool-test-settings-intent-result--fail"}`}
    >
      <div className="tool-test-settings-intent-result__head">
        <span className="tool-test-settings-intent-result__status">
          {result.pass ? "✓" : "✗"}
        </span>
        <strong>{result.label}</strong>
        <code className="tool-test-settings-intent-result__utterance">
          {result.utterance}
        </code>
      </div>
      {result.error ? (
        <p className="tool-test-settings-intent-result__error">{result.error}</p>
      ) : null}
      {result.resolve ? (
        <p className="tool-test-settings-intent-result__resolve">
          intent=<code>{result.resolve.intent ?? "—"}</code>
          {" · "}
          page=<code>{result.resolve.pageId ?? "—"}</code>
          {" · "}
          preset=<code>{result.resolve.presetId ?? result.resolve.preset ?? "—"}</code>
          {" · "}
          key=<code>{result.resolve.settingKey ?? "—"}</code>
        </p>
      ) : null}
      {(result.issues ?? []).length > 0 ? (
        <ul className="tool-test-settings-intent-result__issues">
          {(result.issues ?? []).map((issue) => (
            <li key={`${issue.field}-${issue.expected}`}>
              {issue.field}: 期望 <code>{issue.expected}</code>，实际{" "}
              <code>{issue.actual}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function RunCard({ run }: { run: SettingsIntentRunEntry }) {
  const summary = run.summary;
  const badge = summary
    ? `${summary.passed}/${summary.total}`
    : run.status === "running"
      ? "…"
      : "—";

  return (
    <article className="tool-test-settings-intent-run">
      <header className="tool-test-settings-intent-run__header">
        <span className="tool-test-settings-intent-run__label">
          {run.triggerLabel ?? "启动解析"}
        </span>
        <span
          className={`tool-test-settings-intent-run__badge${summary?.ok ? " tool-test-settings-intent-run__badge--ok" : ""}`}
        >
          {badge}
        </span>
        <time dateTime={new Date(run.at).toISOString()}>
          {formatSettingsIntentRunTime(run.at)}
        </time>
      </header>
      {run.error ? (
        <p className="tool-test-settings-intent-result__error">{run.error}</p>
      ) : null}
      {run.status === "running" ? (
        <p className="tool-test-settings-intent-run__pending">运行中…</p>
      ) : null}
      {summary ? (
        <ul className="tool-test-settings-intent-run__list">
          {(summary.results ?? []).map((result) => (
            <ResultRow key={result.caseId} result={result} />
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function ToolTestSettingsIntentResultPane({
  runs,
  onClearRuns,
}: ToolTestSettingsIntentResultPaneProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: runs.length > 1 ? "smooth" : "auto",
    });
  }, [runs.length, runs[runs.length - 1]?.status]);

  const subText =
    runs.length === 0
      ? "点击侧栏用例或「运行全部用例」"
      : `${runs.length} 次运行`;

  return (
    <ToolTestRunsPaneShell
      heading="启动解析结果"
      subText={subText}
      emptyText="点击侧栏用例或「运行全部用例」"
      runs={runs}
      onClearRuns={onClearRuns}
      streamAnchorRef={endRef}
    >
      {runs.map((run) => (
        <RunCard key={run.id} run={run} />
      ))}
    </ToolTestRunsPaneShell>
  );
}
