"use client";

import { EMPTY_CHAT_ACTION_PROMPTS } from "@/lib/empty-chat-prompts";

type EmptyChatPromptsProps = {
  disabled?: boolean;
  onRun: (text: string) => void;
};

export function EmptyChatPrompts({ disabled = false, onRun }: EmptyChatPromptsProps) {
  return (
    <div className="empty-chat-starters" role="group" aria-label="快速开始">
      <p className="empty-chat-starters-label">写动作示例</p>
      <div className="empty-prompts">
        {EMPTY_CHAT_ACTION_PROMPTS.map((prompt) => (
          <button
            key={prompt.id}
            type="button"
            className="empty-prompt-btn empty-prompt-btn--card"
            disabled={disabled}
            title={prompt.text}
            onClick={() => onRun(prompt.text)}
          >
            <span className="empty-prompt-btn__title">{prompt.label}</span>
            <span className="empty-prompt-btn__hint">{prompt.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
