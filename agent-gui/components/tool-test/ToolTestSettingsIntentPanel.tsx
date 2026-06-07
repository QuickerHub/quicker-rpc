"use client";

import { useCallback, useState } from "react";
import {
  getDefaultSettingsIntentCase,
  SETTINGS_INTENT_CASE_GROUPS,
  type SettingsIntentCase,
} from "@/lib/quicker-settings-intent-cases";
import {
  summarizeSettingsIntentBatch,
  type SettingsIntentBatchSummary,
  type SettingsIntentCheckResult,
} from "@/lib/quicker-settings-intent-check";
import {
  createSettingsIntentRunId,
  type SettingsIntentRunEntry,
} from "@/lib/quicker-settings-intent-runs";

type ToolTestSettingsIntentPanelProps = {
  disabled?: boolean;
  onAppendRun: (entry: SettingsIntentRunEntry) => void;
  onPatchRun: (id: string, patch: Partial<SettingsIntentRunEntry>) => void;
};

function normalizeSettingsIntentSummary(
  data: unknown,
): SettingsIntentBatchSummary {
  if (!data || typeof data !== "object") {
    return { ok: false, total: 0, passed: 0, failed: 0, results: [] };
  }
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.results)) {
    return obj as SettingsIntentBatchSummary;
  }
  if ("caseId" in obj && "pass" in obj) {
    return summarizeSettingsIntentBatch([obj as SettingsIntentCheckResult]);
  }
  return { ok: false, total: 0, passed: 0, failed: 0, results: [] };
}

async function runBatch(caseId?: string): Promise<SettingsIntentBatchSummary> {
  const res = await fetch("/api/dev/settings-intent-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(caseId ? { caseId } : {}),
  });
  return normalizeSettingsIntentSummary(await res.json());
}

async function runCustom(utterance: string) {
  const res = await fetch("/api/dev/settings-intent-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ utterance }),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

export function ToolTestSettingsIntentPanel({
  disabled,
  onAppendRun,
  onPatchRun,
}: ToolTestSettingsIntentPanelProps) {
  const [running, setRunning] = useState(false);
  const [customQuery, setCustomQuery] = useState(
    () => getDefaultSettingsIntentCase().utterance,
  );

  const startRun = useCallback(
    async (label: string, runner: () => Promise<unknown>) => {
      if (disabled || running) return;
      setRunning(true);
      const id = createSettingsIntentRunId();
      onAppendRun({
        id,
        at: Date.now(),
        triggerLabel: label,
        status: "running",
      });
      try {
        const summary = (await runner()) as SettingsIntentBatchSummary;
        onPatchRun(id, {
          status: "done",
          summary,
        });
      } catch (e) {
        onPatchRun(id, {
          status: "error",
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setRunning(false);
      }
    },
    [disabled, running, onAppendRun, onPatchRun],
  );

  const runSingleCase = useCallback(
    (testCase: SettingsIntentCase) => {
      void startRun(testCase.label, () => runBatch(testCase.id));
    },
    [startRun],
  );

  const runAll = useCallback(() => {
    void startRun("全部用例", () => runBatch());
  }, [startRun]);

  const runCustomQuery = useCallback(() => {
    const text = customQuery.trim();
    if (!text) return;
    void startRun("自定义", async () => {
      const data = await runCustom(text);
      return {
        ok: data.ok === true,
        total: 1,
        passed: data.ok === true ? 1 : 0,
        failed: data.ok === true ? 0 : 1,
        results: [
          {
            caseId: "custom",
            label: "自定义",
            utterance: text,
            pass: data.ok === true,
            resolve: data.resolve as SettingsIntentBatchSummary["results"][0]["resolve"],
            issues: [],
            error: typeof data.error === "string" ? data.error : undefined,
          },
        ],
      } satisfies SettingsIntentBatchSummary;
    });
  }, [customQuery, startRun]);

  return (
    <div className="tool-test-settings-intent-panel">
      <p className="tool-test-settings-intent-panel__hint">
        调用 <code>settings resolve</code>（不打开 Quicker UI），对照 golden
        cases 检查 intent / pageId / preset。
      </p>
      <button
        type="button"
        className="tool-test-settings-intent-panel__run-all"
        disabled={disabled || running}
        onClick={runAll}
      >
        {running ? "运行中…" : "运行全部用例"}
      </button>

      {SETTINGS_INTENT_CASE_GROUPS.map((group) => (
        <section key={group.id} className="tool-test-settings-intent-group">
          <h3 className="tool-test-settings-intent-group__title">{group.label}</h3>
          <div className="tool-test-settings-intent-group__chips">
            {group.cases.map((testCase) => (
              <button
                key={testCase.id}
                type="button"
                className="tool-test-settings-intent-chip"
                disabled={disabled || running}
                title={testCase.description ?? testCase.utterance}
                onClick={() => runSingleCase(testCase)}
              >
                {testCase.label}
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="tool-test-settings-intent-custom">
        <h3 className="tool-test-settings-intent-group__title">自定义 query</h3>
        <textarea
          className="tool-test-settings-intent-custom__input"
          rows={2}
          value={customQuery}
          disabled={disabled || running}
          onChange={(e) => setCustomQuery(e.target.value)}
          placeholder="输入用户指令，如：打开手势设置"
        />
        <button
          type="button"
          className="tool-test-settings-intent-chip"
          disabled={disabled || running || !customQuery.trim()}
          onClick={runCustomQuery}
        >
          解析
        </button>
      </section>
    </div>
  );
}
