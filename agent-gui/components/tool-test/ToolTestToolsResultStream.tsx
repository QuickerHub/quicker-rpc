"use client";

import { useEffect, useRef } from "react";
import {
  getToolOrDynamicToolName,
  isToolOrDynamicToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { MessageParts } from "@/components/chat/MessageParts";
import type { ToolTestConversationStatus } from "@/lib/tool-test-conversation-run";

type ToolTestToolsResultStreamProps = {
  parts: AgentUIMessage["parts"];
  workingDirectory?: string;
  status: ToolTestConversationStatus;
};

function toolPartStatusLabel(part: ToolUIPart | DynamicToolUIPart): string {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return "running";
    case "output-available":
      return "ok";
    case "output-error":
      return "error";
    case "output-denied":
      return "denied";
    default:
      return part.state;
  }
}

export function ToolTestToolsResultStream({
  parts,
  workingDirectory,
  status,
}: ToolTestToolsResultStreamProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "running") return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [parts.length, status]);

  if (parts.length === 0) {
    return (
      <p className="tool-test-tools-stream__empty">
        {status === "running" ? "Executing…" : "No tool calls yet."}
      </p>
    );
  }

  return (
    <div className="tool-test-tools-stream" aria-label="Tool call results">
      {parts.map((part, index) => {
        if (!isToolOrDynamicToolUIPart(part)) return null;
        const toolName = getToolOrDynamicToolName(part);
        const stateLabel = toolPartStatusLabel(part);
        const fragment: AgentUIMessage = {
          id: `tool-test-frag-${part.toolCallId ?? index}`,
          role: "assistant",
          parts: [part],
        };

        return (
          <section
            key={part.toolCallId ?? `part-${index}`}
            className={`tool-test-tools-stream__item tool-test-tools-stream__item--${stateLabel}`}
          >
            <header className="tool-test-tools-stream__head">
              <code className="tool-test-tools-stream__tool-id">{toolName}</code>
              <span
                className={`tool-test-tools-stream__state tool-test-tools-stream__state--${stateLabel}`}
              >
                {stateLabel}
              </span>
            </header>
            <div className="tool-test-tools-stream__body">
              <MessageParts
                message={fragment}
                workingDirectory={workingDirectory}
              />
            </div>
          </section>
        );
      })}
      <div ref={endRef} className="tool-test-tools-stream__anchor" aria-hidden />
    </div>
  );
}
