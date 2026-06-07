"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ASK_QUESTION_TOOL,
  buildAskQuestionToolOutput,
  parseAskQuestionInput,
  parseAskQuestionOutputData,
  summarizeAskQuestionOutput,
  type AskQuestionAnswer,
  type AskQuestionItem,
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

function emptySelections(
  questions: AskQuestionItem[],
): Record<string, string[]> {
  return Object.fromEntries(questions.map((q) => [q.id, []]));
}

export function AskQuestionToolRow({
  toolCallId,
  state,
  input,
  output,
  inBatch = false,
  errorText,
}: AskQuestionToolRowProps) {
  const addToolOutput = useOptionalChatToolActions();
  const parsed = useMemo(() => parseAskQuestionInput(input), [input]);
  const [selections, setSelections] = useState<Record<string, string[]>>(() =>
    parsed ? emptySelections(parsed.questions) : {},
  );

  const submitAnswers = useCallback(
    (answers: Record<string, AskQuestionAnswer>) => {
      if (!addToolOutput) return;
      addToolOutput({
        tool: ASK_QUESTION_TOOL,
        toolCallId,
        output: buildAskQuestionToolOutput(answers),
      });
    },
    [addToolOutput, toolCallId],
  );

  const buildAnswersFromSelections = useCallback(
    (next: Record<string, string[]>): Record<string, AskQuestionAnswer> => {
      if (!parsed) return {};
      const answers: Record<string, AskQuestionAnswer> = {};
      for (const question of parsed.questions) {
        const optionIds = next[question.id] ?? [];
        const labels = optionIds.map((id) => {
          const option = question.options.find((o) => o.id === id);
          return option?.label ?? id;
        });
        answers[question.id] = { optionIds, labels };
      }
      return answers;
    },
    [parsed],
  );

  const toggleOption = useCallback(
    (question: AskQuestionItem, optionId: string) => {
      if (!parsed) return;
      setSelections((prev) => {
        const current = prev[question.id] ?? [];
        let nextIds: string[];
        if (question.allow_multiple) {
          nextIds = current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId];
        } else {
          nextIds = [optionId];
        }
        const next = { ...prev, [question.id]: nextIds };

        const singleQuestionImmediate =
          parsed.questions.length === 1
          && !question.allow_multiple
          && nextIds.length === 1;

        if (singleQuestionImmediate) {
          submitAnswers(buildAnswersFromSelections(next));
        }

        return next;
      });
    },
    [buildAnswersFromSelections, parsed, submitAnswers],
  );

  const handleConfirm = useCallback(() => {
    if (!parsed) return;
    const incomplete = parsed.questions.some(
      (q) => (selections[q.id] ?? []).length === 0,
    );
    if (incomplete) return;
    submitAnswers(buildAnswersFromSelections(selections));
  }, [buildAnswersFromSelections, parsed, selections, submitAnswers]);

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

  if (!addToolOutput) {
    return (
      <div
        className={`tool-card tool-card--ask-question${inBatch ? " tool-card--nested" : ""}`}
      >
        <div className="ask-question ask-question--external">
          {parsed.title?.trim() ? (
            <div className="ask-question-title">{parsed.title.trim()}</div>
          ) : null}
          <p className="ask-question-external-hint">请在主窗口选择选项以继续</p>
        </div>
      </div>
    );
  }

  const showConfirm =
    parsed.questions.length > 1
    || parsed.questions.some((q) => q.allow_multiple);

  const confirmDisabled = parsed.questions.some(
    (q) => (selections[q.id] ?? []).length === 0,
  );

  return (
    <div
      className={`tool-card tool-card--ask-question${inBatch ? " tool-card--nested" : ""}`}
      role="group"
      aria-label={parsed.title?.trim() || "请选择"}
    >
      <div className="ask-question">
        {parsed.title?.trim() ? (
          <div className="ask-question-title">{parsed.title.trim()}</div>
        ) : null}
        <div className="ask-question-list">
          {parsed.questions.map((question) => (
            <fieldset key={question.id} className="ask-question-fieldset">
              <legend className="ask-question-prompt">{question.prompt}</legend>
              <div
                className={`ask-question-options${question.allow_multiple ? " ask-question-options--multi" : ""}`}
                role={question.allow_multiple ? "group" : "radiogroup"}
                aria-label={question.prompt}
              >
                {question.options.map((option) => {
                  const selected = (selections[question.id] ?? []).includes(
                    option.id,
                  );
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`ask-question-option${selected ? " ask-question-option--selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() => toggleOption(question, option.id)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        {showConfirm ? (
          <div className="ask-question-actions">
            <button
              type="button"
              className="ask-question-confirm"
              disabled={confirmDisabled}
              onClick={handleConfirm}
            >
              确认
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
