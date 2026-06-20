"use client";

import { useCallback, useState } from "react";
import {
  HARNESS_SCENARIOS,
  getHarnessScenario,
  type HarnessScenario,
} from "@/lib/tool-test-harness-scenarios";
import {
  createContextCompressionRunId,
  type ContextCompressionRunEntry,
  type HarnessPreviewRunResult,
} from "@/lib/tool-test-context-compression-runs";

type ToolTestHarnessSectionProps = {
  disabled?: boolean;
  workingDirectory?: string;
  onAppendRun: (entry: ContextCompressionRunEntry) => void;
  onPatchRun: (id: string, patch: Partial<ContextCompressionRunEntry>) => void;
};

function buildHarnessRunSnapshot(
  scenarioId: string,
  scenarioLabel: string,
): ContextCompressionRunEntry {
  return {
    id: createContextCompressionRunId(),
    at: Date.now(),
    scenarioId,
    scenarioLabel,
    mode: "harness",
    status: "running",
    llmSelection: "",
    llmModelLabel: "Harness 本地",
    messageCount: 0,
    contextLimit: 0,
    force: false,
  };
}

function parseHarnessPreviewResult(value: unknown): HarnessPreviewRunResult | null {
  if (typeof value !== "object" || value == null) return null;
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (
    kind !== "sliding-window"
    && kind !== "shell-artifact"
    && kind !== "list-tools-routing"
  ) {
    return null;
  }
  return record as HarnessPreviewRunResult;
}

function parseStaticShellReport(value: unknown): HarnessPreviewRunResult | null {
  if (typeof value !== "object" || value == null) return null;
  const report = value as Record<string, unknown>;
  const targets = report.targets as Record<string, unknown> | undefined;
  const segments = Array.isArray(report.segments)
    ? report.segments
        .map((item) => {
          if (typeof item !== "object" || item == null) return null;
          const seg = item as Record<string, unknown>;
          const label = typeof seg.label === "string" ? seg.label : "";
          const tokens = typeof seg.tokens === "number" ? seg.tokens : 0;
          return label ? { label, tokens } : null;
        })
        .filter((item): item is { label: string; tokens: number } => item != null)
    : [];

  return {
    kind: "static-shell",
    systemPromptTokens:
      typeof report.systemPromptTokens === "number" ? report.systemPromptTokens : undefined,
    toolDefinitionTokens:
      typeof report.toolDefinitionTokens === "number" ? report.toolDefinitionTokens : undefined,
    toolDefinitionTokensFull:
      typeof report.toolDefinitionTokensFull === "number"
        ? report.toolDefinitionTokensFull
        : undefined,
    slimExtendedToolCount:
      typeof report.slimExtendedToolCount === "number"
        ? report.slimExtendedToolCount
        : undefined,
    totalStaticTokens:
      typeof report.totalStaticTokens === "number" ? report.totalStaticTokens : undefined,
    toolCount: typeof report.toolCount === "number" ? report.toolCount : undefined,
    systemWithinTarget: targets?.systemWithinTarget === true,
    toolsWithinBudget: targets?.toolsWithinBudget === true,
    targetSystemTokens:
      typeof targets?.systemTokens === "number" ? targets.systemTokens : undefined,
    staticSegments: segments,
  };
}

async function runStaticShellBaseline(
  workingDirectory: string | undefined,
): Promise<HarnessPreviewRunResult> {
  const res = await fetch("/api/dev/static-shell-baseline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cwd: workingDirectory?.trim() || undefined,
      chatMode: "agent",
      authoringSampleUserText:
        "创建一个调用 REST API 并解析 JSON 字段的动作",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "request failed");
  }
  const harness = parseStaticShellReport(data.report);
  if (!harness) {
    throw new Error("invalid static shell baseline payload");
  }
  return harness;
}

async function runHarnessPreview(
  scenarioId: string,
  workingDirectory: string | undefined,
): Promise<HarnessPreviewRunResult> {
  const res = await fetch("/api/dev/harness-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scenarioId,
      workingDirectory: workingDirectory?.trim() || undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "request failed");
  }
  const harness = parseHarnessPreviewResult(data.result);
  if (!harness) {
    throw new Error("invalid harness preview payload");
  }
  return harness;
}

async function executeHarnessScenario(
  scenario: HarnessScenario,
  workingDirectory: string | undefined,
): Promise<HarnessPreviewRunResult> {
  if (scenario.kind === "static-shell") {
    return runStaticShellBaseline(workingDirectory);
  }
  return runHarnessPreview(scenario.id, workingDirectory);
}

export function ToolTestHarnessSection({
  disabled,
  workingDirectory,
  onAppendRun,
  onPatchRun,
}: ToolTestHarnessSectionProps) {
  const [scenarioId, setScenarioId] = useState(
    () => HARNESS_SCENARIOS[0]?.id ?? "sliding-window-old-tool",
  );
  const [running, setRunning] = useState(false);

  const runScenario = useCallback(
    async (targetScenarioId?: string) => {
      if (running) return;
      const id = targetScenarioId ?? scenarioId;
      const scenario = getHarnessScenario(id);
      if (!scenario) return;

      setScenarioId(id);
      setRunning(true);

      const run = buildHarnessRunSnapshot(id, scenario.label);
      onAppendRun(run);

      try {
        const harness = await executeHarnessScenario(scenario, workingDirectory);
        onPatchRun(run.id, { status: "done", harness });
      } catch (err) {
        onPatchRun(run.id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setRunning(false);
      }
    },
    [onAppendRun, onPatchRun, running, scenarioId, workingDirectory],
  );

  const disabledAll = disabled || running;

  return (
    <section className="ctx-compression-panel__harness">
      <p className="autofix-panel__section-label">Harness · 上下文瘦身 / 基线</p>
      <p className="ctx-compression-panel__mode-hint">
        sliding-window、Shell artifact、list_tools routing、static shell token 基线；不调用 LLM。
      </p>

      <div className="autofix-panel__scenarios" role="group" aria-label="Harness 场景">
        <p className="autofix-panel__section-label">选择场景</p>
        {HARNESS_SCENARIOS.map((item) => (
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
          CLI 等价：<code>pnpm measure:static-shell</code>（需 dev server）
        </p>
      </div>
    </section>
  );
}
