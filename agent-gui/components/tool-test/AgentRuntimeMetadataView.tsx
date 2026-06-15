"use client";

import type { AgentUIMessage } from "@/lib/chat-types";
import { buildAgentRuntimeMetadataDisplay } from "@/lib/agent-runtime-metadata-display";

export function AgentRuntimeMetadataView({
  message,
}: {
  message: AgentUIMessage;
}) {
  if (message.role !== "assistant") return null;
  const display = buildAgentRuntimeMetadataDisplay(message.metadata);
  if (!display) return null;

  return (
    <dl
      className="agent-runtime-meta"
      aria-label="Agent runtime metadata"
      data-agent-runtime-metadata={display.exportJson}
    >
      {display.intent ? (
        <div>
          <dt>intent</dt>
          <dd>{display.intent}</dd>
        </div>
      ) : null}
      {display.risk ? (
        <div>
          <dt>risk</dt>
          <dd>{display.risk}</dd>
        </div>
      ) : null}
      <div>
        <dt>recovery</dt>
        <dd>{display.recovery}</dd>
      </div>
      <div>
        <dt>feedback</dt>
        <dd>{display.feedbackCount}</dd>
      </div>
      {display.recommendedTools.length > 0 ? (
        <div className="agent-runtime-meta__wide">
          <dt>tools</dt>
          <dd>{display.recommendedTools.join(", ")}</dd>
        </div>
      ) : null}
    </dl>
  );
}
