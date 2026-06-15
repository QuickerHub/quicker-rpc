"use client";

import { useEffect, useMemo, type RefObject } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  isPlaceholderAssistantMessage,
  resolveAgentActivity,
} from "@/lib/agent-activity";
import { collectPendingAskQuestions, ASK_QUESTION_TOOL } from "@/lib/ask-question-tool";
import { AgentActivityLine } from "@/components/chat/AgentActivityLine";
import { AskQuestionDock } from "@/components/chat/AskQuestionDock";
import { MessageParts } from "@/components/chat/MessageParts";
import { AgentRuntimeMetadataView } from "@/components/tool-test/AgentRuntimeMetadataView";
import {
  ChatToolActionsProvider,
  type ChatAddToolOutput,
} from "@/lib/chat-tool-actions";

type ToolTestLauncherAgentChatMessagesProps = {
  messages: AgentUIMessage[];
  workingDirectory?: string;
  emptyHint?: string;
  endRef?: RefObject<HTMLDivElement | null>;
  status?: "running" | "done" | "error";
  error?: string;
  /** Live run: enables ask_question dock + tool row actions. */
  addToolOutput?: ChatAddToolOutput | null;
};

export function ToolTestLauncherAgentChatMessages({
  messages,
  workingDirectory,
  emptyHint,
  endRef,
  status,
  error,
  addToolOutput,
}: ToolTestLauncherAgentChatMessagesProps) {
  const busy = status === "running";

  const pendingAskQuestions = useMemo(
    () => collectPendingAskQuestions(messages),
    [messages],
  );
  const activePendingAsk = pendingAskQuestions[0] ?? null;
  const awaitingAskInput = activePendingAsk != null;

  useEffect(() => {
    if (!awaitingAskInput) return;
    endRef?.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [awaitingAskInput, endRef, activePendingAsk?.toolCallId]);

  const agentActivity = useMemo(
    () =>
      busy || awaitingAskInput
        ? resolveAgentActivity({
            chatStatus: awaitingAskInput ? "ready" : "streaming",
            messages,
            pendingApprovalCount: 0,
            pendingAskQuestionCount: pendingAskQuestions.length,
          })
        : null,
    [awaitingAskInput, busy, messages, pendingAskQuestions.length],
  );

  const lastVisibleMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (
        agentActivity
        && i === messages.length - 1
        && message
        && isPlaceholderAssistantMessage(message)
      ) {
        continue;
      }
      return message?.id ?? null;
    }
    return null;
  }, [messages, agentActivity]);

  if (messages.length === 0) {
    return emptyHint ? (
      <p className="tool-test-chat-messages__empty">{emptyHint}</p>
    ) : null;
  }

  const transcript = (
    <div className="launcher-transcript tool-test-launcher-transcript">
      <div className="launcher-transcript-inner">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`launcher-msg launcher-msg--${message.role}${
              message.id === lastVisibleMessageId && !agentActivity
                ? " launcher-msg--last"
                : ""
            }`}
          >
            <div className="launcher-msg-content">
              <MessageParts
                message={message}
                workingDirectory={workingDirectory}
              />
              <AgentRuntimeMetadataView message={message} />
            </div>
          </article>
        ))}

        {agentActivity ? (
          <article className="launcher-msg launcher-msg--assistant launcher-msg--activity">
            <div className="launcher-msg-content">
              <AgentActivityLine activity={agentActivity} />
            </div>
          </article>
        ) : null}

        {error ? (
          <div className="launcher-error" role="alert">
            {error}
          </div>
        ) : null}

        {!busy && messages.length > 0 && !error && status === "done" && !awaitingAskInput ? (
          <p className="launcher-done-hint" role="status">
            测试完成
          </p>
        ) : null}
      </div>

      {activePendingAsk && addToolOutput ? (
        <div className="tool-test-launcher-transcript__ask-dock">
          <AskQuestionDock
            pending={activePendingAsk}
            disabled={false}
            onSubmit={(toolCallId, output) => {
              void addToolOutput({
                tool: ASK_QUESTION_TOOL,
                toolCallId,
                output,
              });
            }}
          />
        </div>
      ) : null}

      {endRef ? (
        <div ref={endRef} className="messages-anchor" aria-hidden />
      ) : null}
    </div>
  );

  if (addToolOutput) {
    return (
      <ChatToolActionsProvider addToolOutput={addToolOutput}>
        {transcript}
      </ChatToolActionsProvider>
    );
  }

  return transcript;
}
