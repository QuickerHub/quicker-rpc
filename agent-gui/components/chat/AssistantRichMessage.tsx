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
  onSendPrompt?: (text: string) => void;
};

export function AssistantRichMessage({
  content,
  workingDirectory,
  onSendPrompt,
}: AssistantRichMessageProps) {
  const units = useMemo(() => {
    if (!hasAssistantActionLinks(content)) return null;
    const segments = parseAssistantMessageSegments(content);
    return finalizeAssistantRenderUnits(groupAssistantRenderUnits(segments));
  }, [content]);

  if (!content.trim()) {
    return null;
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
              onSendPrompt={onSendPrompt}
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
