"use client";

import {
  ASK_QUESTION_SCENARIOS,
  type AskQuestionScenario,
} from "@/lib/tool-test-ask-question-scenarios";

type ToolTestAskQuestionPanelProps = {
  activeScenarioId: string | null;
  disabled?: boolean;
  onSelectScenario: (scenario: AskQuestionScenario) => void;
};

export function ToolTestAskQuestionPanel({
  activeScenarioId,
  disabled,
  onSelectScenario,
}: ToolTestAskQuestionPanelProps) {
  return (
    <div className="tool-test-ask-question-panel">
      <p className="tool-test-ask-question-panel__hint">
        在右侧交互区手动操作 <code>ask_question</code> Dock，验证单选、多选与连续选题流程。
      </p>

      <div className="tool-test-ask-question-panel__list">
        {ASK_QUESTION_SCENARIOS.map((scenario) => {
          const active = activeScenarioId === scenario.id;
          return (
            <button
              key={scenario.id}
              type="button"
              className={`tool-test-ask-question-scenario${active ? " tool-test-ask-question-scenario--active" : ""}`}
              disabled={disabled}
              onClick={() => onSelectScenario(scenario)}
            >
              <span className="tool-test-ask-question-scenario__label">
                {scenario.label}
              </span>
              <span className="tool-test-ask-question-scenario__desc">
                {scenario.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
