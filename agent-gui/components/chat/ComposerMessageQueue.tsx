"use client";

import { memo } from "react";
import { formatComposerQueuePreview } from "@/lib/compose-user-message";

type ComposerMessageQueueProps = {
  queuedMessages: readonly string[];
  busy: boolean;
  onRemove: (index: number) => void;
};

function ComposerMessageQueueInner({
  queuedMessages,
  busy,
  onRemove,
}: ComposerMessageQueueProps) {
  if (queuedMessages.length === 0) return null;

  return (
    <div
      className="composer-message-queue"
      role="region"
      aria-label={`已排队 ${queuedMessages.length} 条消息`}
    >
      <div className="composer-message-queue__header">
        <span className="composer-message-queue__title">
          {`发送队列 · ${queuedMessages.length}`}
        </span>
        {busy ? (
          <span className="composer-message-queue__hint">
            空输入框 Enter 立即发送第一条
          </span>
        ) : null}
      </div>
      <ol className="composer-message-queue__list">
        {queuedMessages.map((text, index) => (
          <li key={`${index}:${text.slice(0, 24)}`} className="composer-message-queue__item">
            <span className="composer-message-queue__index" aria-hidden>
              {index + 1}
            </span>
            <span className="composer-message-queue__preview" title={formatComposerQueuePreview(text, 500)}>
              {formatComposerQueuePreview(text)}
            </span>
            <button
              type="button"
              className="composer-message-queue__remove"
              aria-label={`从队列移除第 ${index + 1} 条消息`}
              title="移出队列"
              onClick={() => onRemove(index)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                <path
                  d="M4.5 4.5l7 7M11.5 4.5l-7 7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const ComposerMessageQueue = memo(ComposerMessageQueueInner);
