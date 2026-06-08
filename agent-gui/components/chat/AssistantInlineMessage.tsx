"use client";

import type { AssistantInlineSegment } from "@/lib/action-link-markup";
import { ActionPromptTag } from "@/components/chat/ActionPromptTag";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";

type AssistantInlineMessageProps = {
  segments: AssistantInlineSegment[];
};

function InlineMarkdown({ content }: { content: string }) {
  if (!content) return null;
  return (
    <MarkdownMessage content={content} variant="assistant" inline />
  );
}

export function AssistantInlineMessage({ segments }: AssistantInlineMessageProps) {
  return (
    <div className="assistant-inline-message">
      {segments.map((segment, index) => {
        if (segment.type === "ref") {
          return (
            <ActionPromptTag
              key={`${segment.ref.actionId}-${index}`}
              action={{
                id: segment.ref.actionId,
                title: segment.ref.title,
                kind: segment.ref.kind,
                callIdentifier: segment.ref.callIdentifier,
              }}
              variant="sent"
            />
          );
        }
        if (!segment.text) return null;
        return (
          <InlineMarkdown key={`t-${index}`} content={segment.text} />
        );
      })}
    </div>
  );
}
