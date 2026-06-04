"use client";

import {
  groupEmptyChatPromptsByCategory,
} from "@/lib/empty-chat-prompts";

type EmptyChatPromptsProps = {
  disabled?: boolean;
  onRun: (text: string) => void;
};

export function EmptyChatPrompts({ disabled = false, onRun }: EmptyChatPromptsProps) {
  const sections = groupEmptyChatPromptsByCategory();

  return (
    <div className="empty-chat-starters" role="group" aria-label="Agent 测试用例">
      <p className="empty-chat-starters-label">Agent 测试用例</p>
      <p className="empty-chat-starters-desc">
        按 P1–P7 / 工作区 / 子程序 / 回归约束分组；只读项不会要求 patch。
      </p>
      <div className="empty-chat-starters-scroll">
        {sections.map((section) => (
          <section
            key={section.category}
            className="empty-chat-starters-section"
            aria-label={section.label}
          >
            <h3 className="empty-chat-starters-section-label">{section.label}</h3>
            <div className="empty-prompts">
              {section.items.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  className="empty-prompt-btn empty-prompt-btn--card"
                  disabled={disabled}
                  title={prompt.text}
                  onClick={() => onRun(prompt.text)}
                >
                  <span className="empty-prompt-btn__title">
                    {prompt.label}
                    {prompt.readOnly ? (
                      <span className="empty-prompt-btn__badge">只读</span>
                    ) : null}
                  </span>
                  <span className="empty-prompt-btn__hint">{prompt.hint}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
