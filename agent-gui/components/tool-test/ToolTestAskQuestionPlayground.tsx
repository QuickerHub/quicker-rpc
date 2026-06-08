"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AskQuestionDock } from "@/components/chat/AskQuestionDock";
import { AskQuestionToolRow } from "@/components/chat/AskQuestionToolRow";
import {
  buildAskQuestionToolOutput,
  parseAskQuestionOutputData,
  summarizeAskQuestionOutput,
  type PendingAskQuestion,
} from "@/lib/ask-question-tool";
import { ChatToolActionsProvider } from "@/lib/chat-tool-actions";
import type { AskQuestionScenario } from "@/lib/tool-test-ask-question-scenarios";

type ToolTestAskQuestionPlaygroundProps = {
  scenario: AskQuestionScenario;
  onComplete: (payload: {
    outputSummary: string;
    answers: NonNullable<ReturnType<typeof parseAskQuestionOutputData>>["answers"];
    durationMs: number;
  }) => void;
};

export function ToolTestAskQuestionPlayground({
  scenario,
  onComplete,
}: ToolTestAskQuestionPlaygroundProps) {
  const sessionKey = useRef(0);
  const [resetNonce, setResetNonce] = useState(0);
  const startedAtRef = useRef(Date.now());
  const [toolState, setToolState] = useState<"input-available" | "output-available">(
    "input-available",
  );
  const [output, setOutput] = useState<unknown>(undefined);

  const toolCallId = useMemo(
    () => `tool-test-ask-${scenario.id}-${sessionKey.current}-${resetNonce}`,
    [scenario.id, resetNonce],
  );

  const pending = useMemo<PendingAskQuestion>(
    () => ({
      toolCallId,
      input: scenario.input,
    }),
    [scenario.input, toolCallId],
  );

  const handleSubmit = useCallback(
    (_toolCallId: string, toolOutput: ReturnType<typeof buildAskQuestionToolOutput>) => {
      const summary = summarizeAskQuestionOutput(toolOutput) ?? "已选择";
      const data = parseAskQuestionOutputData(toolOutput);
      setOutput(toolOutput);
      setToolState("output-available");
      onComplete({
        outputSummary: summary,
        answers: data?.answers ?? {},
        durationMs: Date.now() - startedAtRef.current,
      });
    },
    [onComplete],
  );

  const handleReset = useCallback(() => {
    sessionKey.current += 1;
    startedAtRef.current = Date.now();
    setOutput(undefined);
    setToolState("input-available");
    setResetNonce((n) => n + 1);
  }, []);

  return (
    <ChatToolActionsProvider
      addToolOutput={() => {
        /* Playground uses AskQuestionDock onSubmit instead. */
      }}
    >
      <section
        className="tool-test-ask-question-playground"
        aria-label={`用户选择 UI 测试：${scenario.label}`}
      >
        <header className="tool-test-ask-question-playground__head">
          <div>
            <h3 className="tool-test-ask-question-playground__title">
              {scenario.label}
            </h3>
            <p className="tool-test-ask-question-playground__desc">
              {scenario.description}
            </p>
          </div>
          <button
            type="button"
            className="tool-test-ask-question-playground__reset"
            onClick={handleReset}
          >
            重新测试
          </button>
        </header>

        <ul className="tool-test-ask-question-playground__checklist">
          {scenario.checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <div className="tool-test-ask-question-playground__layout">
          <div className="tool-test-ask-question-playground__messages">
            <p className="tool-test-ask-question-playground__section-label">
              消息区预览
            </p>
            <div className="tool-test-ask-question-playground__message-card">
              <AskQuestionToolRow
                toolCallId={toolCallId}
                state={toolState}
                input={scenario.input}
                output={output}
              />
            </div>
          </div>

          <div className="tool-test-ask-question-playground__composer">
            <p className="tool-test-ask-question-playground__section-label">
              Composer 上方 Dock
            </p>
            {toolState === "input-available" ? (
              <AskQuestionDock pending={pending} onSubmit={handleSubmit} />
            ) : (
              <div className="tool-test-ask-question-playground__submitted" role="status">
                已提交：
                <strong>{summarizeAskQuestionOutput(output) ?? "完成"}</strong>
              </div>
            )}
            <div className="tool-test-ask-question-playground__composer-mock" aria-hidden>
              <span className="tool-test-ask-question-playground__composer-placeholder">
                输入框占位（主聊天 composer）
              </span>
            </div>
          </div>
        </div>
      </section>
    </ChatToolActionsProvider>
  );
}
