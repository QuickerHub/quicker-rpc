"use client";

import { ModelSelector } from "@/components/chat/ModelSelector";
import { TitlebarDragRegion } from "@/components/shell/TitlebarDragRegion";
import Link from "next/link";
import { useMemo } from "react";
import type { QuickerBenchTask } from "@/lib/quickerbench/catalog-types";
import type { QuickerBenchRunEntry } from "@/lib/tool-test-quickerbench-runs";
import { formatBenchMockSummary } from "@/lib/use-bench-chat-controller";
import { useBenchChat } from "./BenchChatProvider";

function tierLabel(tier: string): string {
  if (tier === "Q1") return "Q1 · 单能力";
  if (tier === "Q2") return "Q2 · 多步";
  if (tier === "Q3") return "Q3 · 外部集成";
  return tier;
}

function runStatusLabel(run: QuickerBenchRunEntry): string {
  if (run.status === "preparing") return "准备中";
  if (run.status === "running") return "对话中";
  if (run.status === "verifying") return "Mock 断言";
  if (run.status === "done") return formatBenchMockSummary(run) ?? "完成";
  if (run.status === "error") return run.error ?? "失败";
  return run.status;
}

function runStatusClass(run: QuickerBenchRunEntry): string {
  if (run.status === "error") return "bench-run-status--error";
  if (run.status === "done") return "bench-run-status--pass";
  if (run.status === "verifying" || run.status === "running" || run.status === "preparing") {
    return "bench-run-status--busy";
  }
  return "";
}

function BenchTaskButton({
  task,
  active,
  disabled,
  onRun,
}: {
  task: QuickerBenchTask;
  active: boolean;
  disabled: boolean;
  onRun: () => void;
}) {
  return (
    <li className={`ws-row ws-thread-row${active ? " ws-row--active" : ""}`}>
      <div className={`ws-item ws-thread-item${active ? " ws-item--active" : ""}`}>
        <button
          type="button"
          data-testid={`tool-test-quickerbench-task-${task.id}`}
          className="ws-thread-item-main"
          disabled={disabled}
          onClick={onRun}
          title={task.userPrompt}
        >
          <span className="ws-item-label">{task.label}</span>
          <span className="bench-task-id">{task.id}</span>
        </button>
      </div>
    </li>
  );
}

function BenchRunRow({
  run,
  selected,
  disabled,
  onSelect,
}: {
  run: QuickerBenchRunEntry;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <li className={`ws-row ws-thread-row${selected ? " ws-row--active" : ""}`}>
      <div className={`ws-item ws-thread-item${selected ? " ws-item--active" : ""}`}>
        <button
          type="button"
          className="ws-thread-item-main"
          disabled={disabled}
          onClick={onSelect}
        >
          <span className="ws-item-label">{run.taskLabel}</span>
          <span className={`bench-run-status ${runStatusClass(run)}`}>
            {runStatusLabel(run)}
          </span>
        </button>
      </div>
    </li>
  );
}

export function BenchTaskSidebar() {
  const {
    tasks,
    llmSelection,
    setLlmSelection,
    activeTaskId,
    runs,
    selectedRunId,
    setSelectedRunId,
    runTask,
    chatBusy,
    disabled,
  } = useBenchChat();

  const grouped = useMemo(() => {
    const order = ["Q3", "Q2", "Q1"] as const;
    const map = new Map<string, QuickerBenchTask[]>();
    for (const task of tasks) {
      const list = map.get(task.tier) ?? [];
      list.push(task);
      map.set(task.tier, list);
    }
    return order
      .filter((tier) => map.has(tier))
      .map((tier) => ({ tier, tasks: map.get(tier)! }));
  }, [tasks]);

  return (
    <aside className="workspace-sidebar bench-sidebar" aria-label="QuickerBench 任务">
      <div className="ws-section-head ws-section-head--titlebar">
        <span className="bench-sidebar__title">QuickerBench</span>
        <Link href="/tool-test" className="bench-sidebar__link" title="开发者工具测试页">
          Dev
        </Link>
        <TitlebarDragRegion className="ws-section-head-drag" />
      </div>

      <div className="bench-sidebar__model">
        <span className="bench-sidebar__model-label">对话模型</span>
        <ModelSelector
          selection={llmSelection}
          disabled={disabled || chatBusy}
          onChange={setLlmSelection}
        />
      </div>

      <div className="ws-sidebar-scroll bench-sidebar__scroll">
        {grouped.map(({ tier, tasks: tierTasks }) => (
          <section key={tier} className="bench-sidebar__group" aria-label={tierLabel(tier)}>
            <h3 className="bench-sidebar__group-heading">{tierLabel(tier)}</h3>
            <ul className="ws-list ws-thread-group-list">
              {tierTasks.map((task) => (
                <BenchTaskButton
                  key={task.id}
                  task={task}
                  active={activeTaskId === task.id && chatBusy}
                  disabled={disabled || chatBusy}
                  onRun={() => void runTask(task.id)}
                />
              ))}
            </ul>
          </section>
        ))}

        {runs.length > 0 ? (
          <section className="bench-sidebar__group" aria-label="运行记录">
            <h3 className="bench-sidebar__group-heading">运行记录</h3>
            <ul className="ws-list ws-thread-group-list">
              {runs.map((run) => (
                <BenchRunRow
                  key={run.id}
                  run={run}
                  selected={selectedRunId === run.id}
                  disabled={chatBusy}
                  onSelect={() => setSelectedRunId(run.id)}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <p className="bench-sidebar__hint">
        点击任务：隔离空工作区 → 完整对话 → 自动 Mock 断言与导出
      </p>
    </aside>
  );
}
