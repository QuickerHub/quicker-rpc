"use client";

import { useCallback, useState } from "react";
import {
  AGENT_VIEW_SCENARIOS,
  getAgentViewScenario,
} from "@/lib/tool-test-agent-view-scenarios";
import {
  createContextCompressionRunId,
  type ContextCompressionRunEntry,
} from "@/lib/tool-test-context-compression-runs";
import {
  formatToolModelPayloadJson,
  formatToolNextAction,
} from "@/lib/tool-result-agent-view-display";

type ToolTestAgentViewSectionProps = {
  disabled?: boolean;
  onAppendRun: (entry: ContextCompressionRunEntry) => void;
  onPatchRun: (id: string, patch: Partial<ContextCompressionRunEntry>) => void;
};

function buildAgentViewRunSnapshot(
  scenarioId: string,
  scenarioLabel: string,
): ContextCompressionRunEntry {
  return {
    id: createContextCompressionRunId(),
    at: Date.now(),
    scenarioId,
    scenarioLabel,
    mode: "agent-view",
    status: "running",
    llmSelection: "",
    llmModelLabel: "L1 本地",
    messageCount: 0,
    contextLimit: 0,
    force: false,
  };
}

export function ToolTestAgentViewSection({
  disabled,
  onAppendRun,
  onPatchRun,
}: ToolTestAgentViewSectionProps) {
  const [scenarioId, setScenarioId] = useState(
    () => AGENT_VIEW_SCENARIOS[0]?.id ?? "shell-large",
  );
  const [running, setRunning] = useState(false);

  const runScenario = useCallback(
    async (targetScenarioId?: string) => {
      if (running) return;
      const id = targetScenarioId ?? scenarioId;
      const scenario = getAgentViewScenario(id);
      if (!scenario) return;

      setScenarioId(id);
      setRunning(true);

      const run = buildAgentViewRunSnapshot(id, scenario.label);
      onAppendRun(run);

      try {
        const res = await fetch("/api/dev/agent-view-compress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId: id }),
        });
        const data = await res.json();
        if (!res.ok) {
          onPatchRun(run.id, {
            status: "error",
            error: typeof data.error === "string" ? data.error : "request failed",
          });
          return;
        }
        const stats = data.compressStats;
        const nextAction = stats?.nextActions?.[0];
        onPatchRun(run.id, {
          status: "done",
          agentView: {
            beforeChars: data.beforeChars ?? 0,
            afterChars: data.afterChars ?? 0,
            savedChars: data.savedChars ?? 0,
            compressed: data.compressed === true,
            compressionEnabled: data.compressionEnabled === true,
            summary: stats?.summary,
            modelTokens: stats?.modelTokens,
            nextAction: nextAction ? formatToolNextAction(nextAction) : undefined,
            modelPayloadJson: formatToolModelPayloadJson(data.output) ?? undefined,
          },
        });
      } catch (err) {
        onPatchRun(run.id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setRunning(false);
      }
    },
    [onAppendRun, onPatchRun, running, scenarioId],
  );

  const disabledAll = disabled || running;

  return (
    <section className="ctx-compression-panel__agent-view">
      <p className="autofix-panel__section-label">L1 工具结果压缩</p>
      <p className="ctx-compression-panel__mode-hint">
        L1 直接裁剪默认关闭（完整工具结果进模型）。本面板对比裁剪前后体积；
        默认已启用 L1 压缩（grep 按路径合并、step_runner 摘要）；设{" "}
        <code>TOOL_RESULT_AGENT_VIEW_COMPRESSION=0</code> 可关闭语义压缩。
      </p>

      <div className="autofix-panel__scenarios" role="group" aria-label="压缩场景">
        <p className="autofix-panel__section-label">选择场景</p>
        {AGENT_VIEW_SCENARIOS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`autofix-scenario-btn${scenarioId === item.id ? " autofix-scenario-btn--active" : ""}`}
            disabled={disabledAll}
            onClick={() => void runScenario(item.id)}
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
          disabled={disabledAll}
          onClick={() => void runScenario()}
        >
          {running ? "运行中…" : "重新运行当前场景"}
        </button>
        <p className="autofix-panel__run-hint">
          formatToolResultForAgent 前后 payload 体积对比
        </p>
      </div>
    </section>
  );
}
