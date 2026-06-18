"use client";

import { useCallback, useState } from "react";
import {
  AGENT_VIEW_SCENARIOS,
  getAgentViewScenario,
} from "@/lib/tool-test-agent-view-scenarios";
import { formatAgentViewRefetch, formatAgentViewModelPayloadJson } from "@/lib/tool-result-agent-view-display";

type AgentViewRunResult = {
  scenarioId: string;
  scenarioLabel: string;
  beforeChars: number;
  afterChars: number;
  savedChars: number;
  compressed: boolean;
  agentSummary?: string;
  modelTokens?: number;
  refetch?: string;
  modelPayloadJson?: string;
  error?: string;
};

type ToolTestAgentViewSectionProps = {
  disabled?: boolean;
};

export function ToolTestAgentViewSection({ disabled }: ToolTestAgentViewSectionProps) {
  const [scenarioId, setScenarioId] = useState(
    () => AGENT_VIEW_SCENARIOS[0]?.id ?? "shell-large",
  );
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<AgentViewRunResult[]>([]);

  const runScenario = useCallback(async () => {
    const scenario = getAgentViewScenario(scenarioId);
    if (!scenario) return;
    setRunning(true);
    try {
      const res = await fetch("/api/dev/agent-view-compress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRuns((prev) => [{
          scenarioId,
          scenarioLabel: scenario.label,
          beforeChars: 0,
          afterChars: 0,
          savedChars: 0,
          compressed: false,
          error: typeof data.error === "string" ? data.error : "request failed",
        }, ...prev]);
        return;
      }
      setRuns((prev) => [{
        scenarioId,
        scenarioLabel: scenario.label,
        beforeChars: data.beforeChars ?? 0,
        afterChars: data.afterChars ?? 0,
        savedChars: data.savedChars ?? 0,
        compressed: data.compressed === true,
        agentSummary: data.agentView?.agentSummary,
        modelTokens: data.agentView?.modelTokens,
        refetch: data.agentView?.refetch
          ? formatAgentViewRefetch(data.agentView.refetch)
          : undefined,
        modelPayloadJson: formatAgentViewModelPayloadJson(data.output) ?? undefined,
      }, ...prev]);
    } catch (err) {
      setRuns((prev) => [{
        scenarioId,
        scenarioLabel: scenario.label,
        beforeChars: 0,
        afterChars: 0,
        savedChars: 0,
        compressed: false,
        error: err instanceof Error ? err.message : String(err),
      }, ...prev]);
    } finally {
      setRunning(false);
    }
  }, [scenarioId]);

  return (
    <section className="ctx-compression-panel__agent-view">
      <p className="autofix-panel__section-label">L1 Agent View 压缩</p>
      <p className="ctx-compression-panel__mode-hint">
        调用 /api/dev/agent-view-compress，对比 formatToolResultForAgent 前后 payload 体积。
      </p>

      <div className="autofix-panel__scenarios" role="group" aria-label="Agent view 场景">
        {AGENT_VIEW_SCENARIOS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`autofix-scenario-btn${scenarioId === item.id ? " autofix-scenario-btn--active" : ""}`}
            disabled={disabled || running}
            onClick={() => setScenarioId(item.id)}
          >
            <span className="autofix-scenario-btn__label">{item.label}</span>
            <span className="autofix-scenario-btn__desc">{item.description}</span>
          </button>
        ))}
      </div>

      <div className="autofix-panel__footer">
        <button
          type="button"
          className={`autofix-panel__run-btn${running ? " autofix-panel__run-btn--running" : ""}`}
          disabled={disabled || running}
          onClick={() => void runScenario()}
        >
          {running ? "运行中…" : "运行 Agent View 场景"}
        </button>
        {runs.length > 0 ? (
          <button
            type="button"
            className="autofix-panel__clear-btn"
            disabled={running}
            onClick={() => setRuns([])}
          >
            清空结果
          </button>
        ) : null}
      </div>

      {runs.length > 0 ? (
        <div className="ctx-compression-panel__agent-view-runs">
          {runs.map((run, index) => (
            <article key={`${run.scenarioId}-${index}`} className="ctx-compression-run-card">
              <header className="ctx-compression-run-card__header">
                <span className="ctx-compression-run-card__label">{run.scenarioLabel}</span>
                <span
                  className={`ctx-compression-run-card__badge${run.compressed ? " ctx-compression-run-card__badge--ok" : ""}`}
                >
                  {run.error ? "失败" : run.compressed ? "已压缩" : "未压缩"}
                </span>
              </header>
              {run.error ? (
                <p className="tool-test-title-result__error">{run.error}</p>
              ) : (
                <dl className="ctx-compression-run-card__meta">
                  <div>
                    <dt>体积</dt>
                    <dd>
                      {run.beforeChars.toLocaleString()} → {run.afterChars.toLocaleString()} chars
                      {" "}
                      (−{run.savedChars.toLocaleString()})
                    </dd>
                  </div>
                  {run.agentSummary ? (
                    <div>
                      <dt>摘要</dt>
                      <dd>{run.agentSummary}</dd>
                    </div>
                  ) : null}
                  {run.modelTokens != null ? (
                    <div>
                      <dt>模型</dt>
                      <dd>~{run.modelTokens.toLocaleString()} tok</dd>
                    </div>
                  ) : null}
                  {run.refetch ? (
                    <div>
                      <dt>续读</dt>
                      <dd>{run.refetch}</dd>
                    </div>
                  ) : null}
                </dl>
              )}
              {!run.error && run.modelPayloadJson ? (
                <details className="ctx-compression-panel__agent-view-output">
                  <summary>模型可见 payload</summary>
                  <pre className="tool-json">{run.modelPayloadJson}</pre>
                </details>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
