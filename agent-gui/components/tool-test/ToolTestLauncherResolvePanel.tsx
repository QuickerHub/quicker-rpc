"use client";

import { useCallback, useState } from "react";
import {
  flattenSettingsIntentCases,
  getDefaultSettingsIntentCase,
} from "@/lib/quicker-settings-intent-cases";
import type { LauncherResolveCandidate } from "@/lib/launcher/launcher-resolve-presets";
import type { LauncherResolveAgentOutput } from "@/lib/launcher/launcher-resolve-agent-output";
import {
  createLauncherResolveRunId,
  type LauncherResolveRunEntry,
} from "@/lib/tool-test-launcher-resolve-runs";

const LAUNCHER_RESOLVE_TOOL_NAME = "launcher_resolve";

type ToolTestLauncherResolvePanelProps = {
  disabled?: boolean;
  workingDirectory?: string;
  onAppendRun: (entry: LauncherResolveRunEntry) => void;
  onPatchRun: (id: string, patch: Partial<LauncherResolveRunEntry>) => void;
};

function slimOutputToCandidates(
  output: LauncherResolveAgentOutput,
): LauncherResolveCandidate[] {
  const list: LauncherResolveCandidate[] = [];
  if (output.next) {
    list.push({
      kind: "next",
      score: 1000,
      title: output.query ?? "next",
      suggestedTool: output.next.tool,
      suggestedInput: output.next.input,
    });
  }
  for (const [index, alt] of (output.alternatives ?? []).entries()) {
    list.push({
      kind: alt.kind,
      score: 880 - index * 40,
      title: alt.label,
      suggestedTool: alt.tool,
      suggestedInput: alt.input,
    });
  }
  return list;
}

async function callLauncherResolve(
  query: string,
  workingDirectory?: string,
): Promise<{ ok: boolean; candidates: LauncherResolveCandidate[]; error?: string }> {
  const res = await fetch("/api/tools/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      toolName: LAUNCHER_RESOLVE_TOOL_NAME,
      input: { query },
      workingDirectory: workingDirectory?.trim() || undefined,
      toolCallId: `tool-test-${Date.now()}`,
    }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      candidates: [],
      error: typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
    };
  }
  const output = data.output as LauncherResolveAgentOutput | undefined;
  if (!output || output.ok !== true) {
    return {
      ok: false,
      candidates: [],
      error:
        typeof output?.message === "string"
          ? output.message
          : typeof (output as Record<string, unknown> | undefined)?.error === "string"
            ? String((output as Record<string, unknown>).error)
            : "No match",
    };
  }
  const candidates = slimOutputToCandidates(output);
  return {
    ok: candidates.length > 0,
    candidates,
    error: candidates.length === 0 ? "No next step" : undefined,
  };
}

export function ToolTestLauncherResolvePanel({
  disabled,
  workingDirectory,
  onAppendRun,
  onPatchRun,
}: ToolTestLauncherResolvePanelProps) {
  const [running, setRunning] = useState(false);
  const [customQuery, setCustomQuery] = useState(
    () => getDefaultSettingsIntentCase().utterance,
  );

  const quickCases = flattenSettingsIntentCases().slice(0, 8);

  const executeResolve = useCallback(
    async (label: string, query: string) => {
      const id = createLauncherResolveRunId();
      onAppendRun({
        id,
        at: Date.now(),
        triggerLabel: label,
        query: query.trim(),
        status: "running",
      });
      try {
        const result = await callLauncherResolve(query.trim(), workingDirectory);
        const top = result.candidates[0];
        onPatchRun(id, {
          status: result.ok ? "done" : "error",
          candidates: result.candidates,
          topTitle: top?.title,
          topKind: top?.kind,
          suggestedTool: top?.suggestedTool ?? undefined,
          error: result.error,
        });
      } catch (e) {
        onPatchRun(id, {
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [onAppendRun, onPatchRun, workingDirectory],
  );

  const startRun = useCallback(
    async (label: string, query: string) => {
      if (disabled || running || !query.trim()) return;
      setRunning(true);
      try {
        await executeResolve(label, query);
      } finally {
        setRunning(false);
      }
    },
    [disabled, executeResolve, running],
  );

  return (
    <div className="tool-test-launcher-resolve-panel">
      <p className="tool-test-launcher-panel__hint">
        调用精简版 <code>launcher_resolve</code>：返回 <code>next.tool</code> +{" "}
        <code>next.input</code>（跨设置/动作/子程序；含 preset 加权）。
      </p>
      <button
        type="button"
        className="tool-test-settings-intent-panel__run-all"
        disabled={disabled || running}
        onClick={() => {
          void (async () => {
            if (disabled || running) return;
            setRunning(true);
            try {
              for (const testCase of quickCases) {
                await executeResolve(testCase.label, testCase.utterance);
              }
            } finally {
              setRunning(false);
            }
          })();
        }}
      >
        {running ? "运行中…" : "批量快测（8 条）"}
      </button>

      <section className="tool-test-settings-intent-group">
        <h3 className="tool-test-settings-intent-group__title">单条 query</h3>
        <div className="tool-test-settings-intent-group__chips">
          {quickCases.map((testCase) => (
            <button
              key={testCase.id}
              type="button"
              className="tool-test-settings-intent-chip"
              disabled={disabled || running}
              title={testCase.utterance}
              onClick={() => void startRun(testCase.label, testCase.utterance)}
            >
              {testCase.label}
            </button>
          ))}
        </div>
      </section>

      <section className="tool-test-settings-intent-custom">
        <h3 className="tool-test-settings-intent-group__title">自定义</h3>
        <textarea
          className="tool-test-settings-intent-custom__input"
          rows={2}
          value={customQuery}
          disabled={disabled || running}
          onChange={(e) => setCustomQuery(e.target.value)}
          placeholder="输入用户指令"
        />
        <button
          type="button"
          className="tool-test-settings-intent-chip"
          disabled={disabled || running || !customQuery.trim()}
          onClick={() => void startRun("自定义", customQuery)}
        >
          Resolve
        </button>
      </section>
    </div>
  );
}
