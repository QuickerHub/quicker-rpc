"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildAskQuestionAnswersFromSelections,
  emptyAskQuestionSelections,
  type AskQuestionInput,
  type AskQuestionItem,
} from "@/lib/ask-question-tool";

function questionSetKey(input: AskQuestionInput): string {
  return input.questions.map((q) => q.id).join("\0");
}

export function useAskQuestionWizard(input: AskQuestionInput | null) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [stepIndex, setStepIndex] = useState(0);

  const questionKey = input ? questionSetKey(input) : "";

  useEffect(() => {
    if (!input) {
      setSelections({});
      setStepIndex(0);
      return;
    }
    setSelections(emptyAskQuestionSelections(input.questions));
    setStepIndex(0);
  }, [input, questionKey]);

  const totalSteps = input?.questions.length ?? 0;
  const currentQuestion: AskQuestionItem | null =
    input && totalSteps > 0 ? (input.questions[stepIndex] ?? null) : null;

  const currentSelection = useMemo(() => {
    if (!currentQuestion) return [];
    return selections[currentQuestion.id] ?? [];
  }, [currentQuestion, selections]);

  const canConfirm = currentSelection.length > 0;
  const isLastStep = stepIndex >= totalSteps - 1;
  const showCancel = stepIndex > 0 || currentSelection.length > 0;

  const toggleOption = useCallback(
    (optionId: string) => {
      if (!currentQuestion) return;
      setSelections((prev) => {
        const current = prev[currentQuestion.id] ?? [];
        const nextIds = currentQuestion.allow_multiple
          ? current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId]
          : [optionId];
        return { ...prev, [currentQuestion.id]: nextIds };
      });
    },
    [currentQuestion],
  );

  const clearCurrentSelection = useCallback(() => {
    if (!currentQuestion) return;
    setSelections((prev) => ({ ...prev, [currentQuestion.id]: [] }));
  }, [currentQuestion]);

  const goBack = useCallback(() => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const advanceOrBuildAnswers = useCallback(() => {
    if (!input || !canConfirm) return null;
    if (!isLastStep) {
      setStepIndex((prev) => prev + 1);
      return null;
    }
    return buildAskQuestionAnswersFromSelections(input.questions, selections);
  }, [canConfirm, input, isLastStep, selections]);

  const handleCancel = useCallback(() => {
    if (stepIndex > 0) {
      goBack();
      return;
    }
    clearCurrentSelection();
  }, [clearCurrentSelection, goBack, stepIndex]);

  return {
    title: input?.title?.trim() ?? "",
    totalSteps,
    stepIndex,
    currentQuestion,
    currentSelection,
    canConfirm,
    isLastStep,
    showCancel,
    toggleOption,
    advanceOrBuildAnswers,
    handleCancel,
  };
}
