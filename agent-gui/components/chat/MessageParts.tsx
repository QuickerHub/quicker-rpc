"use client";

import { memo, useMemo } from "react";
import { isTextUIPart } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { AssistantRichMessage } from "./AssistantRichMessage";
import { InlineUserMessage } from "./InlineUserMessage";
import { ReasoningPart } from "./ReasoningPart";
import { segmentMessageParts } from "./tool-part-layout";
import { ToolBatchGroup } from "./ToolBatchGroup";
import { ActivityBatchGroup } from "./ActivityBatchGroup";
import { ToolPart } from "./ToolPart";
import { readToolCallId } from "@/lib/workspace-tool-auto-open";

type MessagePartsProps = {
  message: AgentUIMessage;
  /** Local unsent user-message edit; does not change chat context until send. */
  userTextOverride?: string;
  workingDirectory?: string;
  onInsertComposerPrompt?: (text: string) => void;
};

function MessagePartsInner({
  message,
  userTextOverride,
  workingDirectory,
  onInsertComposerPrompt,
}: MessagePartsProps) {
  const segments = useMemo(
    () => segmentMessageParts(message.parts),
    [message.parts],
  );

  return (
    <>
      {segments.map((segment) => {
        if (segment.kind === "reasoning") {
          const lead = segment.items[0];
          if (!lead) return null;
          const keyIndexes = segment.items.map((item) => item.index).join("-");
          return (
            <ReasoningPart
              key={`reasoning-${message.id}-${keyIndexes}`}
              items={segment.items}
            />
          );
        }

        if (segment.kind === "text") {
          const { part, index } = segment;
          if (!isTextUIPart(part)) return null;
          if (message.role === "user") {
            const userText = userTextOverride ?? part.text;
            if (!userText.trim()) return null;
            return <InlineUserMessage key={index} content={userText} />;
          }
          if (!part.text.trim()) return null;
          return (
            <AssistantRichMessage
              key={index}
              content={part.text}
              workingDirectory={workingDirectory}
              onInsertComposerPrompt={onInsertComposerPrompt}
            />
          );
        }

        if (segment.kind === "tool") {
          const { part, index } = segment.item;
          const toolCallId = readToolCallId(part);
          return (
            <ToolPart
              key={toolCallId ?? `tool-${message.id}-${index}`}
              messageId={message.id}
              partIndex={index}
              part={part}
            />
          );
        }

        if (segment.kind === "activity-batch") {
          const batchLead = segment.items[0];
          if (!batchLead) return null;
          const batchKey =
            batchLead.kind === "tool"
              ? readToolCallId(batchLead.part)
                ?? `activity-${message.id}-${batchLead.index}`
              : `activity-reasoning-${message.id}-${batchLead.index}`;
          return (
            <ActivityBatchGroup
              key={batchKey}
              messageId={message.id}
              items={segment.items}
            />
          );
        }

        const batchLead = segment.items[0]!;
        const batchKey =
          readToolCallId(batchLead.part)
          ?? `batch-${message.id}-${batchLead.index}`;
        return (
          <ToolBatchGroup
            key={batchKey}
            messageId={message.id}
            items={segment.items}
          />
        );
      })}
    </>
  );
}

export const MessageParts = memo(MessagePartsInner);
