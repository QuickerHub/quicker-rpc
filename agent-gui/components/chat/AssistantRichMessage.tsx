"use client";

import { useMemo } from "react";
import {
  hasAssistantActionLinks,
  parseAssistantMessageSegments,
} from "@/lib/action-link-markup";
import { ActionLinkChip } from "@/components/chat/ActionLinkChip";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";

type AssistantRichMessageProps = {
  content: string;
  workingDirectory?: string;
};

export function AssistantRichMessage({
  content,
  workingDirectory,
}: AssistantRichMessageProps) {
  const segments = useMemo(
    () => parseAssistantMessageSegments(content),
    [content],
  );

  if (!content.trim()) {
    return null;
  }

  if (!hasAssistantActionLinks(content)) {
    return <MarkdownMessage content={content} variant="assistant" />;
  }

  return (
    <div className="assistant-rich-message markdown-body markdown-body--assistant">
      {segments.map((segment, index) => {
        if (segment.type === "link") {
          return (
            <ActionLinkChip
              key={`link-${segment.link.actionId}-${segment.link.op}-${index}`}
              link={segment.link}
              workingDirectory={workingDirectory}
            />
          );
        }
        if (!segment.text.trim()) {
          return null;
        }
        return (
          <MarkdownMessage
            key={`text-${index}`}
            content={segment.text}
            variant="assistant"
          />
        );
      })}
    </div>
  );
}
