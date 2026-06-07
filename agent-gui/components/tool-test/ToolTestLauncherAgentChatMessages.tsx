"use client";

import { useMemo, useState, type RefObject } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { LauncherAgentResponseCompletionKind } from "@/lib/tool-test-launcher-agent-timing";
import {
  formatLauncherAgentHiddenSummary,
  hasLauncherAgentHiddenContent,
  planLauncherAgentDisplay,
} from "@/lib/tool-test-launcher-agent-display";
import { ToolPart } from "@/components/chat/ToolPart";
import { ToolTestChatMessages } from "@/components/tool-test/ToolTestChatMessages";

type ToolTestLauncherAgentChatMessagesProps = {
  messages: AgentUIMessage[];
  workingDirectory?: string;
  emptyHint?: string;
  endRef?: RefObject<HTMLDivElement | null>;
  responseCompletionKind?: LauncherAgentResponseCompletionKind;
  status?: "running" | "done" | "error";
};

export function ToolTestLauncherAgentChatMessages({
  messages,
  workingDirectory,
  emptyHint,
  endRef,
  responseCompletionKind,
  status,
}: ToolTestLauncherAgentChatMessagesProps) {
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  const plan = useMemo(
    () =>
      planLauncherAgentDisplay(messages, {
        truncateAfterExecution: !showFullTranscript,
        responseCompletionKind,
      }),
    [messages, responseCompletionKind, showFullTranscript],
  );

  const hiddenSummary = formatLauncherAgentHiddenSummary(plan.hidden);
  const hasHidden = hasLauncherAgentHiddenContent(plan.hidden);

  if (messages.length === 0) {
    return emptyHint ? (
      <p className="tool-test-chat-messages__empty">{emptyHint}</p>
    ) : null;
  }

  if (showFullTranscript) {
    return (
      <div className="tool-test-launcher-agent-chat">
        <div className="tool-test-launcher-agent-chat__toolbar">
          <button
            type="button"
            className="tool-test-launcher-agent-chat__toggle"
            onClick={() => setShowFullTranscript(false)}
          >
            收起 · 工具链视图
          </button>
        </div>
        <ToolTestChatMessages
          messages={messages}
          workingDirectory={workingDirectory}
          endRef={endRef}
        />
      </div>
    );
  }

  return (
    <div className="tool-test-launcher-agent-chat">
      {plan.userPrompt ? (
        <p className="tool-test-launcher-agent-chat__user">
          <span className="tool-test-launcher-agent-chat__user-label">用户</span>
          {plan.userPrompt}
        </p>
      ) : null}

      {plan.visibleTools.length > 0 ? (
        <ol className="tool-test-launcher-agent-chat__tools">
          {plan.visibleTools.map((step) => {
            const key = `${step.messageId}-${step.index}`;
            return (
              <li key={key} className="tool-test-launcher-agent-chat__tool-item">
                <ToolPart
                  messageId={step.messageId}
                  partIndex={step.index}
                  part={step.part}
                />
              </li>
            );
          })}
        </ol>
      ) : status === "running" ? (
        <p className="tool-test-launcher-agent-chat__waiting">等待工具调用…</p>
      ) : (
        <p className="tool-test-launcher-agent-chat__waiting">无工具调用</p>
      )}

      {hasHidden ? (
        <div className="tool-test-launcher-agent-chat__toolbar">
          <button
            type="button"
            className="tool-test-launcher-agent-chat__toggle"
            onClick={() => setShowFullTranscript(true)}
          >
            展开完整对话
            {hiddenSummary ? `（${hiddenSummary}）` : ""}
          </button>
        </div>
      ) : null}

      {endRef ? (
        <div ref={endRef} className="messages-anchor" aria-hidden />
      ) : null}
    </div>
  );
}
