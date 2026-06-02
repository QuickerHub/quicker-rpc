"use client";

import { useMemo } from "react";
import { isTextUIPart, type ChatAddToolApproveResponseFunction } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { InlineUserMessage } from "./InlineUserMessage";
import { MarkdownMessage } from "./MarkdownMessage";
import { segmentMessageParts } from "./tool-part-layout";
import { ToolBatchGroup } from "./ToolBatchGroup";
import { ToolPart } from "./ToolPart";

type MessagePartsProps = {
  message: AgentUIMessage;
  addToolApprovalResponse?: ChatAddToolApproveResponseFunction;
  approvalDisabled?: boolean;
};

export function MessageParts({
  message,
  addToolApprovalResponse,
  approvalDisabled,
}: MessagePartsProps) {
  const segments = useMemo(
    () => segmentMessageParts(message.parts),
    [message.parts],
  );

  return (
    <>
      {segments.map((segment) => {
        if (segment.kind === "text") {
          const { part, index } = segment;
          if (!isTextUIPart(part)) return null;
          if (!part.text.trim()) return null;
          if (message.role === "user") {
            return <InlineUserMessage key={index} content={part.text} />;
          }
          return (
            <MarkdownMessage
              key={index}
              content={part.text}
              variant="assistant"
            />
          );
        }

        if (segment.kind === "tool") {
          return (
            <ToolPart
              key={segment.item.index}
              part={segment.item.part}
              addToolApprovalResponse={addToolApprovalResponse}
              approvalDisabled={approvalDisabled}
            />
          );
        }

        return (
          <ToolBatchGroup
            key={`batch-${segment.items[0]!.index}`}
            items={segment.items}
            addToolApprovalResponse={addToolApprovalResponse}
            approvalDisabled={approvalDisabled}
          />
        );
      })}
    </>
  );
}
