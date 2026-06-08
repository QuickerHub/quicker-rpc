"use client";

import { useMemo } from "react";
import type { LlmEndpointProbeReport, LlmEndpointProbeRow } from "@/lib/llm-endpoint-probe-core";
import { ToolTestRunsPaneShell } from "@/components/tool-test/ToolTestRunsPaneShell";

type ToolTestLlmProbeResultPaneProps = {
  report: LlmEndpointProbeReport | null;
  error: string | null;
  running: boolean;
  onClear: () => void;
};

function ProbeTable({
  title,
  rows,
}: {
  title: string;
  rows: readonly LlmEndpointProbeRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <section className="tool-test-llm-probe-result__section">
      <h3 className="tool-test-llm-probe-result__title">{title}</h3>
      <div className="tool-test-llm-probe-result__table-wrap">
        <table className="tool-test-llm-probe-result__table">
          <thead>
            <tr>
              <th>状态</th>
              <th>ms</th>
              <th>组</th>
              <th>模型</th>
              <th>主机</th>
              <th>Key</th>
              <th>来源</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.id}-${row.method}-${row.sources.join(",")}`}
                className={row.ok
                  ? "tool-test-llm-probe-result__row--ok"
                  : "tool-test-llm-probe-result__row--fail"}
              >
                <td>{row.ok ? "OK" : "FAIL"}</td>
                <td>{row.latencyMs}</td>
                <td>{row.groupLabel ?? row.group ?? "—"}</td>
                <td>{row.model ?? "—"}</td>
                <td>{row.host}</td>
                <td>{row.maskedKey}</td>
                <td>{row.sources.join(", ")}</td>
                <td>{row.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ToolTestLlmProbeResultPane({
  report,
  error,
  running,
  onClear,
}: ToolTestLlmProbeResultPaneProps) {
  const runs = useMemo(() => {
    if (running) return [{ status: "running" as const }];
    if (error) return [{ status: "error" as const }];
    if (report) return [{ status: "done" as const }];
    return [];
  }, [running, error, report]);

  return (
    <ToolTestRunsPaneShell
      heading="LLM Endpoint 探测"
      subText="批量探测 publish / dev / llm-config endpoint 可用性。"
      emptyText={running
        ? "正在批量探测 endpoint…"
        : "在左侧选择配置来源并点击「开始批量探测」。"}
      runs={runs}
      onClearRuns={onClear}
      cleanupDisabled
      externalCleanup={{
        cleanupSession: onClear,
        cleanupBusy: false,
        cleanupHint: null,
        canCleanup: runs.length > 0 && !running,
      }}
    >
      {error ? (
        <p className="tool-test-title-result__error">{error}</p>
      ) : null}

      {report ? (
        <div className="tool-test-llm-probe-result">
          <p className="tool-test-llm-probe-result__meta">
            {report.checkedAt}
            {" · "}
            source=
            {report.source}
            {" · "}
            method=
            {report.method}
            {" · "}
            {report.summary.ok}
            /
            {report.summary.total}
            {" OK"}
          </p>

          <ul className="tool-test-llm-probe-result__summary">
            {Object.entries(report.summary.byGroup).map(([label, stats]) => (
              <li key={label}>
                <strong>{label}</strong>
                {": "}
                {stats.ok}
                /
                {stats.ok + stats.fail}
                {" "}
                {stats.reachable ? "reachable" : "unreachable"}
              </li>
            ))}
          </ul>

          <ProbeTable title="Endpoints" rows={report.rows} />
          <ProbeTable title="Auto candidates" rows={report.autoModels ?? []} />
        </div>
      ) : null}
    </ToolTestRunsPaneShell>
  );
}
