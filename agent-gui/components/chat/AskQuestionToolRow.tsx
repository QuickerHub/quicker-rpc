"use client";

import { useMemo } from "react";
import {
  parseAskQuestionInput,
  parseAskQuestionOutputData,
  summarizeAskQuestionOutput,
} from "@/lib/ask-question-tool";
import { useOptionalChatToolActions } from "@/lib/chat-tool-actions";

type AskQuestionToolRowProps = {
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  inBatch?: boolean;
  errorText?: string;
};

export function AskQuestionToolRow({
  state,
  input,
  output,
  inBatch = false,
  errorText,
}: AskQuestionToolRowProps) {
  const addToolOutput = useOptionalChatToolActions();
  const parsed = useMemo(() => parseAskQuestionInput(input), [input]);

  if (state === "input-streaming" || (state === "input-available" && !parsed)) {
    return (
      <div
        className={`tool-card tool-card--ask-question${inBatch ? " tool-card--nested" : ""}`}
      >
        <div className="ask-question ask-question--loading">准备选项…</div>
      </div>
    );
  }

  if (state === "output-available") {
    const summary = summarizeAskQuestionOutput(output);
    const data = parseAskQuestionOutputData(output);
    return (
      <div
        className={`tool-card tool-card--ask-question tool-card--ask-question-done${inBatch ? " tool-card--nested" : ""}`}
      >
        <div className="ask-question ask-question--done">
          <div className="ask-question-done-title">已选择</div>
          {data ? (
            <ul className="ask-question-done-list">
              {parsed?.questions.map((question) => {
                const answer = data.answers[question.id];
                if (!answer?.labels.length) return null;
                return (
                  <li key={question.id}>
                    {parsed.questions.length > 1 ? (
                      <>
                        <span className="ask-question-done-prompt">
                          {question.prompt}
                        </span>
                        <span className="ask-question-done-value">
                          {answer.labels.join("、")}
                        </span>
                      </>
                    ) : (
                      <span className="ask-question-done-value">
                        {answer.labels.join("、")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="ask-question-done-fallback">{summary ?? "完成"}</div>
          )}
        </div>
      </div>
    );
  }

  if (state === "output-error") {
    return (
      <div
        className={`tool-card tool-card--ask-question tool-card--err${inBatch ? " tool-card--nested" : ""}`}
      >
        <div className="ask-question ask-question--error">
          {errorText ?? "未能获取你的选择"}
        </div>
      </div>
    );
  }

  if (!parsed || state !== "input-available") {
    return null;
  }

  const hint = addToolOutput
    ? "请在下方输入框上方选择选项以继续"
    : "请在主窗口选择选项以继续";

  return (
    <div
      className={`tool-card tool-card--ask-question tool-card--ask-question-pending${inBatch ? " tool-card--nested" : ""}`}
      role="status"
      aria-label={parsed.title?.trim() || "等待选择"}
    >
      <div className="ask-question ask-question--pending">
        {parsed.title?.trim() ? (
          <div className="ask-question-title">{parsed.title.trim()}</div>
        ) : (
          <div className="ask-question-title">
            {parsed.questions.length === 1
              ? parsed.questions[0]!.prompt
              : `共 ${parsed.questions.length} 项待选择`}
          </div>
        )}
        <p className="ask-question-pending-hint">{hint}</p>
      </div>
    </div>
  );
}
