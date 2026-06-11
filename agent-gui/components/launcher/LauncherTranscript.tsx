"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  resolveAgentActivity,
  isPlaceholderAssistantMessage,
} from "@/lib/agent-activity";
import { AgentActivityLine } from "@/components/chat/AgentActivityLine";
import { MessageParts } from "@/components/chat/MessageParts";
import { ApprovalDock } from "@/components/chat/ApprovalDock";
import { ChatToolActionsProvider } from "@/lib/chat-tool-actions";
import type { PendingToolApproval } from "@/lib/tool-approval-display";
import type { WorkspaceDeleteProjectHit } from "@/lib/workspace-action-project-lookup";
import {
  postLauncherApprovalRespond,
  postLauncherToolOutput,
} from "@/lib/launcher/launcher-bridge";

type LauncherTranscriptProps = {
  sessionId: string;
  messages: AgentUIMessage[];
  status: string;
  error: string | null;
  pendingApprovalCount: number;
  pendingApprovals: PendingToolApproval[];
  workspaceDeleteHits: WorkspaceDeleteProjectHit[];
  pendingAskQuestionCount?: number;
  workingDirectory: string;
};

export function LauncherTranscript({
  sessionId,
  messages,
  status,
  error,
  pendingApprovalCount,
  pendingApprovals,
  workspaceDeleteHits,
  pendingAskQuestionCount = 0,
  workingDirectory,
}: LauncherTranscriptProps) {
  const [deleteWorkspaceToo, setDeleteWorkspaceToo] = useState(false);

  const pendingWorkspaceDeleteKey = useMemo(
    () => workspaceDeleteHits.map((hit) => `${hit.kind}:${hit.id}`).join("\0"),
    [workspaceDeleteHits],
  );

  useEffect(() => {
    setDeleteWorkspaceToo(false);
  }, [pendingWorkspaceDeleteKey]);

  const agentActivity = useMemo(
    () =>
      resolveAgentActivity({
        chatStatus: status,
        messages,
        pendingApprovalCount,
      }),
    [status, messages, pendingApprovalCount],
  );

  const busy = status === "submitted" || status === "streaming";
  const needsUserInput =
    pendingApprovalCount > 0 || pendingAskQuestionCount > 0;

  const addToolOutput = useCallback(
    (payload: Parameters<typeof postLauncherToolOutput>[1]) => {
      postLauncherToolOutput(sessionId, payload);
    },
    [sessionId],
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
    <ChatToolActionsProvider addToolOutput={addToolOutput}>
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

        {pendingApprovals.length > 0 ? (
          <ApprovalDock
            approvals={pendingApprovals}
            disabled={busy}
            workspaceHits={workspaceDeleteHits}
            deleteWorkspaceToo={deleteWorkspaceToo}
            onDeleteWorkspaceTooChange={setDeleteWorkspaceToo}
            onApproveAll={(options) => {
              postLauncherApprovalRespond(sessionId, true, options);
            }}
            onDenyAll={() => {
              postLauncherApprovalRespond(sessionId, false);
            }}
          />
        ) : null}

        {error ? (
          <div className="launcher-error" role="alert">
            {error}
          </div>
        ) : null}

        {!busy && messages.length > 0 && !error && !needsUserInput ? (
          <p className="launcher-done-hint" role="status">
            已完成 · Esc 关闭
          </p>
        ) : null}
      </div>
    </ChatToolActionsProvider>
  );
}
