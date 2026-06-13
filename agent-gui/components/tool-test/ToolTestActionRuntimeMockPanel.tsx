"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listAuthoringBenchmarkL2CoreTasks,
  resolveMockProfileId,
  type AuthoringBenchmarkTask,
} from "@/lib/authoring-benchmark";
import { resolveBenchmarkMockActionId } from "@/lib/action-runtime-mock-benchmark-fixtures";
import {
  invokeActionRuntimeDev,
  type ActionRuntimeInvokeArgs,
} from "@/lib/action-runtime-client";
import {
  createActionRuntimeRunId,
  type ActionRuntimeRunEntry,
} from "@/lib/action-runtime-test-runs";
import { pushAppMessage } from "@/lib/app-messages";

type ToolTestActionRuntimeMockPanelProps = {
  disabled?: boolean;
  onAppendRun: (entry: ActionRuntimeRunEntry) => void;
  onPatchRun: (id: string, patch: Partial<ActionRuntimeRunEntry>) => void;
};

type MockProfileSummary = {
  id: string;
  label?: string;
  description?: string;
};

function parseProfilesList(data: unknown): MockProfileSummary[] {
  if (!data || typeof data !== "object") return [];
  const profiles = (data as { profiles?: unknown }).profiles;
  if (!Array.isArray(profiles)) return [];
  const out: MockProfileSummary[] = [];
  for (const item of profiles) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    out.push({
      id,
      label: typeof row.label === "string" ? row.label : undefined,
      description:
        typeof row.description === "string" ? row.description : undefined,
    });
  }
  return out;
}

export function ToolTestActionRuntimeMockPanel({
  disabled,
  onAppendRun,
  onPatchRun,
}: ToolTestActionRuntimeMockPanelProps) {
  const l2Tasks = useMemo(() => listAuthoringBenchmarkL2CoreTasks(), []);
  const mockTasks = useMemo(
    () => l2Tasks.filter((task) => task.verify?.mockProfile),
    [l2Tasks],
  );

  const [actionIds, setActionIds] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const task of mockTasks) {
      initial[task.id] = resolveBenchmarkMockActionId(task.id);
    }
    return initial;
  });
  const [profiles, setProfiles] = useState<MockProfileSummary[]>([]);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  const loadProfiles = useCallback(async () => {
    setProfilesError(null);
    const result = await invokeActionRuntimeDev("mockProfilesList");
    if (!result.ok) {
      setProfilesError(result.message ?? result.error ?? "加载 mock profile 失败");
      return;
    }
    setProfiles(parseProfilesList(result.data));
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const runMock = useCallback(
    async (
      task: AuthoringBenchmarkTask,
      options?: { labelSuffix?: string; fromBatch?: boolean },
    ) => {
      if (disabled) return;
      if (!options?.fromBatch && (batchBusy || busyTaskId)) return;
      const actionId = actionIds[task.id]?.trim();
      if (!actionId) {
        pushAppMessage({
          id: "tool-test-runtime-mock",
          kind: "warning",
          body: `请填写 ${task.id} 的动作 id`,
          autoDismissMs: 4000,
        });
        return;
      }

      const mockProfile = resolveMockProfileId(task);
      const args: ActionRuntimeInvokeArgs = {
        id: actionId,
        mockProfile,
        assert: true,
      };

      setBusyTaskId(task.id);
      const entry: ActionRuntimeRunEntry = {
        id: createActionRuntimeRunId(),
        at: Date.now(),
        label: `Mock 断言：${task.label}${options?.labelSuffix ?? ""}`,
        op: "mockRun",
        status: "running",
        requestArgs: { ...args, taskId: task.id },
      };
      onAppendRun(entry);

      try {
        const result = await invokeActionRuntimeDev("mockRun", args);
        onPatchRun(entry.id, {
          status: result.ok ? "done" : "error",
          result,
          error: result.ok ? undefined : result.message ?? result.error,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "请求失败";
        onPatchRun(entry.id, { status: "error", error: message });
      } finally {
        setBusyTaskId(null);
      }
    },
    [actionIds, batchBusy, busyTaskId, disabled, onAppendRun, onPatchRun],
  );

  const runAllL2Mock = useCallback(async () => {
    if (disabled || batchBusy || busyTaskId) return;
    setBatchBusy(true);
    try {
      for (const task of mockTasks) {
        await runMock(task, { labelSuffix: "（批量）", fromBatch: true });
      }
    } finally {
      setBatchBusy(false);
    }
  }, [batchBusy, busyTaskId, disabled, mockTasks, runMock]);

  const profileById = useMemo(() => {
    const map = new Map<string, MockProfileSummary>();
    for (const profile of profiles) {
      map.set(profile.id, profile);
    }
    return map;
  }, [profiles]);

  return (
    <section className="tool-test-runtime-group tool-test-runtime-group--mock">
      <h3 className="tool-test-runtime-group__title">Benchmark Mock 断言（F 轴）</h3>
      <p className="tool-test-runtime-panel__hint">
        对 L2 主干任务运行 <code>action run --mock --assert</code>。需 Quicker +
        插件；动作 id 默认来自 SDK retro，可改。
      </p>

      <div className="tool-test-runtime-row">
        <button
          type="button"
          className="tool-test-runtime-btn"
          disabled={disabled || batchBusy || Boolean(busyTaskId)}
          onClick={() => void loadProfiles()}
        >
          刷新 profile 列表
        </button>
        <button
          type="button"
          className="tool-test-runtime-btn tool-test-runtime-btn--primary"
          disabled={disabled || batchBusy || Boolean(busyTaskId)}
          onClick={() => void runAllL2Mock()}
        >
          批量跑 L2 mock（{mockTasks.length}）
        </button>
      </div>

      {profilesError ? (
        <p className="tool-test-runtime-search__error">{profilesError}</p>
      ) : profiles.length > 0 ? (
        <p className="tool-test-runtime-search__status">
          已加载 {profiles.length} 个 mock profile
        </p>
      ) : null}

      <div className="tool-test-runtime-group__list">
        {mockTasks.map((task) => {
          const profileId = resolveMockProfileId(task);
          const profileMeta = profileById.get(profileId);
          const busy = busyTaskId === task.id;
          return (
            <div key={task.id} className="tool-test-runtime-case tool-test-runtime-case--mock">
              <div className="tool-test-runtime-case__text">
                <span className="tool-test-runtime-case__label">{task.label}</span>
                <span className="tool-test-runtime-case__meta">
                  {task.id} · profile <code>{profileId}</code>
                  {profileMeta?.description ? ` · ${profileMeta.description}` : ""}
                </span>
              </div>
              <label className="tool-test-runtime-field">
                <span className="tool-test-runtime-field__label">动作 id</span>
                <input
                  className="tool-test-runtime-field__input"
                  value={actionIds[task.id] ?? ""}
                  disabled={disabled || batchBusy || busy}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  onChange={(e) =>
                    setActionIds((prev) => ({
                      ...prev,
                      [task.id]: e.target.value,
                    }))
                  }
                />
              </label>
              <div className="tool-test-runtime-case__actions">
                <button
                  type="button"
                  className="tool-test-runtime-btn tool-test-runtime-btn--primary"
                  disabled={disabled || batchBusy || busy}
                  onClick={() => void runMock(task)}
                >
                  {busy ? "运行中…" : "Mock 断言"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
