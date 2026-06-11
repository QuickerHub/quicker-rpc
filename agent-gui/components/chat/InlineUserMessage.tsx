"use client";

import { useCallback, type ClipboardEvent } from "react";
import { ActionPromptTag } from "@/components/chat/ActionPromptTag";
import { BrowserElementPromptTag } from "@/components/chat/BrowserElementPromptTag";
import { SlashPromptTag } from "@/components/chat/SlashPromptTag";
import {
  hasPasteableUserMessageFormat,
  parseUserMessageSegments,
} from "@/lib/compose-user-message";

type InlineUserMessageProps = {
  content: string;
};

export function InlineUserMessage({ content }: InlineUserMessageProps) {
  const segments = parseUserMessageSegments(content);
  const pasteable = hasPasteableUserMessageFormat(content);
  const isEmpty = segments.every(
    (s) => s.type === "text" && s.text.trim().length === 0,
  );

  const handleCopy = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!pasteable) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", content);
    },
    [content, pasteable],
  );

  if (isEmpty) {
    return null;
  }

  return (
    <div
      className="user-message-display user-message-display--inline"
      aria-label="用户消息"
      title={pasteable ? "复制时将保留动作标签，可粘贴回输入框" : undefined}
      onCopy={handleCopy}
    >
      {segments.map((segment, index) => {
        if (segment.type === "tag") {
          return (
            <ActionPromptTag
              key={`${segment.action.id}-${index}`}
              action={segment.action}
              variant="sent"
            />
          );
        }
        if (segment.type === "browser-element") {
          return (
            <BrowserElementPromptTag
              key={`${segment.element.tagId}-${index}`}
              element={segment.element}
              variant="sent"
            />
          );
        }
        if (segment.type === "slash-tag") {
          return (
            <SlashPromptTag
              key={`${segment.ref.kind}:${segment.ref.name}-${index}`}
              slash={segment.ref}
              variant="sent"
            />
          );
        }
        if (!segment.text) return null;
        return (
          <span key={`t-${index}`} className="user-message-text">
            {segment.text}
          </span>
        );
      })}
    </div>
  );
}
