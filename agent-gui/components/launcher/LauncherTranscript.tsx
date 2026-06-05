"use client";

import { useMemo } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  resolveAgentActivity,
  isPlaceholderAssistantMessage,
} from "@/lib/agent-activity";
import { AgentActivityLine } from "@/components/chat/AgentActivityLine";
import { MessageParts } from "@/components/chat/MessageParts";
import type { PingState } from "@/lib/use-qkrpc-ping";

type LauncherTranscriptProps = {
  messages: AgentUIMessage[];
  status: string;
  error: string | null;
  pendingApprovalCount: number;
  workingDirectory: string;
  ping: PingState;
};

export function LauncherTranscript({
  messages,
  status,
  error,
  pendingApprovalCount,
  workingDirectory,
  ping,
}: LauncherTranscriptProps) {
  const busy = status === "submitted" || status === "streaming";
  const qkrpcOk = ping.status === "ok";
  const qkrpcLoading = ping.status === "loading";

  const agentActivity = useMemo(
    () =>
      resolveAgentActivity({
        chatStatus: status,
        messages,
        qkrpcOk,
        qkrpcLoading,
        pendingApprovalCount,
      }),
    [status, messages, qkrpcOk, qkrpcLoading, pendingApprovalCount],
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

  return (
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
                keepToolBatchesExpanded={busy}
              />
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

      {pendingApprovalCount > 0 ? (
        <p className="launcher-approval-hint" role="status">
          需在主窗口确认 {pendingApprovalCount} 项操作
        </p>
      ) : null}

      {!busy && messages.length > 0 && !error ? (
        <p className="launcher-done-hint" role="status">
          已完成 · Esc 关闭
        </p>
      ) : null}
    </div>
  );
}
