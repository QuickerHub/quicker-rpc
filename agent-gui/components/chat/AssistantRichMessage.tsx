"use client";

import { useMemo } from "react";
import {
  finalizeAssistantRenderUnits,
  groupAssistantRenderUnits,
  hasAssistantActionLinks,
  parseAssistantMessageSegments,
} from "@/lib/action-link-markup";
import { ActionLinkBar } from "@/components/chat/ActionLinkBar";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";

type AssistantRichMessageProps = {
  content: string;
  workingDirectory?: string;
  onInsertComposerPrompt?: (text: string) => void;
  /** Skip react-markdown while tokens stream in (parsed once when idle). */
  streamPlainText?: boolean;
};

export function AssistantRichMessage({
  content,
  workingDirectory,
  onInsertComposerPrompt,
  streamPlainText = false,
}: AssistantRichMessageProps) {
  const units = useMemo(() => {
    if (streamPlainText || !hasAssistantActionLinks(content)) return null;
    const segments = parseAssistantMessageSegments(content);
    return finalizeAssistantRenderUnits(groupAssistantRenderUnits(segments));
  }, [content]);

  if (!content.trim()) {
    return null;
  }

  if (streamPlainText) {
    return (
      <div className="markdown-body markdown-body--assistant assistant-stream-plain">
        {content}
      </div>
    );
  }

  if (!units) {
    return <MarkdownMessage content={content} variant="assistant" />;
  }

  return (
    <div className="assistant-rich-message">
      {units.map((unit, index) => {
        if (unit.kind === "link-bar") {
          return (
            <ActionLinkBar
              key={`bar-${index}`}
              links={unit.links}
              workingDirectory={workingDirectory}
              onInsertComposerPrompt={onInsertComposerPrompt}
            />
          );
        }
        return (
          <MarkdownMessage
            key={`md-${index}`}
            content={unit.text}
            variant="assistant"
          />
        );
      })}
    </div>
  );
}
