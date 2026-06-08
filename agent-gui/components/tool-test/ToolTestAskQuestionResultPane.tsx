"use client";

import { useCallback } from "react";
import {
  createAskQuestionRunId,
  formatAskQuestionRunTime,
  type AskQuestionRunEntry,
} from "@/lib/tool-test-ask-question-runs";
import type { AskQuestionScenario } from "@/lib/tool-test-ask-question-scenarios";
import { ToolTestAskQuestionPlayground } from "@/components/tool-test/ToolTestAskQuestionPlayground";

type ToolTestAskQuestionResultPaneProps = {
  activeScenario: AskQuestionScenario | null;
  runs: AskQuestionRunEntry[];
  onClearRuns: () => void;
  onAppendRun: (entry: AskQuestionRunEntry) => void;
};

function RunCard({ run }: { run: AskQuestionRunEntry }) {
  return (
    <article className="tool-test-ask-question-run">
      <header className="tool-test-ask-question-run__head">
        <span className="tool-test-ask-question-run__label">{run.scenarioLabel}</span>
        <span className="tool-test-ask-question-run__badge">完成</span>
        <time dateTime={new Date(run.at).toISOString()}>
          {formatAskQuestionRunTime(run.at)}
        </time>
      </header>
      <p className="tool-test-ask-question-run__summary">{run.outputSummary}</p>
      <p className="tool-test-ask-question-run__meta">
        耗时 {run.durationMs} ms
      </p>
      {run.answers ? (
        <ul className="tool-test-ask-question-run__answers">
          {Object.entries(run.answers).map(([questionId, answer]) => (
            <li key={questionId}>
              <code>{questionId}</code>
              {" → "}
              {answer.labels.join("、") || "—"}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function ToolTestAskQuestionResultPane({
  activeScenario,
  runs,
  onClearRuns,
  onAppendRun,
}: ToolTestAskQuestionResultPaneProps) {
  const handleComplete = useCallback(
    (payload: {
      outputSummary: string;
      answers: AskQuestionRunEntry["answers"];
      durationMs: number;
    }) => {
      if (!activeScenario) return;
      onAppendRun({
        id: createAskQuestionRunId(),
        at: Date.now(),
        scenarioId: activeScenario.id,
        scenarioLabel: activeScenario.label,
        status: "done",
        durationMs: payload.durationMs,
        outputSummary: payload.outputSummary,
        answers: payload.answers,
      });
    },
    [activeScenario, onAppendRun],
  );

  const hasContent = activeScenario != null || runs.length > 0;

  return (
    <main className="tool-test-title-pane tool-test-title-pane--ask-question">
      <header className="tool-test-title-pane__head">
        <h2 className="tool-test-title-pane__heading">用户选择 UI</h2>
        <div className="tool-test-pane-toolbar">
          <p className="tool-test-title-pane__sub">
            模拟主聊天 composer 上方的 AskQuestionDock 与消息区摘要
          </p>
          {runs.length > 0 ? (
            <button
              type="button"
              className="tool-test-pane-toolbar__action tool-test-pane-toolbar__action--danger"
              onClick={onClearRuns}
            >
              清空记录
            </button>
          ) : null}
        </div>
      </header>

      <div className="tool-test-title-stream">
        {!hasContent ? (
          <p className="tool-test-title-pane__empty">
            在左侧选择一个场景开始手动 UI 测试
          </p>
        ) : null}

        {activeScenario ? (
          <ToolTestAskQuestionPlayground
            key={activeScenario.id}
            scenario={activeScenario}
            onComplete={handleComplete}
          />
        ) : null}

        {runs.length > 0 ? (
          <section className="tool-test-ask-question-history">
            <h3 className="tool-test-ask-question-history__title">提交记录</h3>
            {runs.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
