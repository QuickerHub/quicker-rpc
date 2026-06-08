"use client";

import { useCallback } from "react";
import {
  ASK_QUESTION_TOOL,
  buildAskQuestionToolOutput,
  type PendingAskQuestion,
} from "@/lib/ask-question-tool";
import { useAskQuestionWizard } from "@/lib/use-ask-question-wizard";
import { useOptionalChatToolActions } from "@/lib/chat-tool-actions";

type AskQuestionDockProps = {
  pending: PendingAskQuestion;
  disabled?: boolean;
  onSubmit?: (toolCallId: string, output: ReturnType<typeof buildAskQuestionToolOutput>) => void;
};

export function AskQuestionDock({
  pending,
  disabled = false,
  onSubmit,
}: AskQuestionDockProps) {
  const addToolOutput = useOptionalChatToolActions();
  const wizard = useAskQuestionWizard(pending.input);

  const submitAnswers = useCallback(
    (output: ReturnType<typeof buildAskQuestionToolOutput>) => {
      if (onSubmit) {
        onSubmit(pending.toolCallId, output);
        return;
      }
      if (!addToolOutput) return;
      addToolOutput({
        tool: ASK_QUESTION_TOOL,
        toolCallId: pending.toolCallId,
        output,
      });
    },
    [addToolOutput, onSubmit, pending.toolCallId],
  );

  const handleConfirm = useCallback(() => {
    const answers = wizard.advanceOrBuildAnswers();
    if (!answers) return;
    submitAnswers(buildAskQuestionToolOutput(answers));
  }, [submitAnswers, wizard]);

  if (!wizard.currentQuestion) return null;

  const confirmLabel = wizard.isLastStep ? "确认" : "下一步";
  const modeHint = wizard.currentQuestion.allow_multiple
    ? "可多选"
    : "单选";

  return (
    <div
      className="ask-question-dock"
      role="group"
      aria-label={wizard.title || wizard.currentQuestion.prompt}
    >
      <div className="ask-question-dock__header">
        <div className="ask-question-dock__heading">
          {wizard.title ? (
            <div className="ask-question-dock__title">{wizard.title}</div>
          ) : null}
          {wizard.totalSteps > 1 ? (
            <div className="ask-question-dock__progress" aria-hidden>
              {pending.input.questions.map((_, index) => (
                <span
                  key={index}
                  className={`ask-question-dock__progress-dot${
                    index < wizard.stepIndex
                      ? " ask-question-dock__progress-dot--done"
                      : index === wizard.stepIndex
                        ? " ask-question-dock__progress-dot--active"
                        : ""
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>
        {wizard.totalSteps > 1 ? (
          <div className="ask-question-dock__step-label">
            {wizard.stepIndex + 1} / {wizard.totalSteps}
          </div>
        ) : null}
      </div>

      <div className="ask-question-dock__body">
        <div className="ask-question-dock__prompt-row">
          <div className="ask-question-dock__prompt">
            {wizard.currentQuestion.prompt}
          </div>
          <span className="ask-question-dock__mode">{modeHint}</span>
        </div>

        <div
          className={`ask-question-dock__options${
            wizard.currentQuestion.allow_multiple
              ? " ask-question-dock__options--multi"
              : ""
          }`}
          role={wizard.currentQuestion.allow_multiple ? "group" : "radiogroup"}
          aria-label={wizard.currentQuestion.prompt}
        >
          {wizard.currentQuestion.options.map((option) => {
            const selected = wizard.currentSelection.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                className={`ask-question-dock__option${
                  selected ? " ask-question-dock__option--selected" : ""
                }`}
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => wizard.toggleOption(option.id)}
              >
                <span className="ask-question-dock__option-indicator" aria-hidden>
                  {wizard.currentQuestion?.allow_multiple ? (
                    <span className="ask-question-dock__checkbox" />
                  ) : (
                    <span className="ask-question-dock__radio" />
                  )}
                </span>
                <span className="ask-question-dock__option-label">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="ask-question-dock__actions">
        {wizard.showCancel ? (
          <button
            type="button"
            className="ask-question-dock__btn ask-question-dock__btn--cancel"
            disabled={disabled}
            onClick={wizard.handleCancel}
          >
            {wizard.stepIndex > 0 ? "上一步" : "取消"}
          </button>
        ) : null}
        <button
          type="button"
          className="ask-question-dock__btn ask-question-dock__btn--confirm"
          disabled={disabled || !wizard.canConfirm}
          onClick={handleConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
