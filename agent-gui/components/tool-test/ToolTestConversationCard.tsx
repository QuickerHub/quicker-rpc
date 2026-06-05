"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  toolTestConversationStatusLabel,
  type ToolTestConversationStatus,
} from "@/lib/tool-test-conversation-run";
import { formatTitleTestRunTime } from "@/lib/tool-test-title-runs";
import { ToolTestChatMessages } from "@/components/tool-test/ToolTestChatMessages";

export type ToolTestConversationCardProps = {
  label: string;
  badge?: ReactNode;
  badgeTitle?: string;
  status: ToolTestConversationStatus;
  statusLabels?: { running?: string; done?: string; error?: string };
  at: number;
  messages: AgentUIMessage[];
  workingDirectory?: string;
  keepToolBatchesExpanded?: boolean;
  emptyHint?: string;
  footer?: ReactNode;
  /** Extra deps to auto-scroll while streaming (e.g. part count). */
  streamTick?: number;
};

export function ToolTestConversationCard({
  label,
  badge,
  badgeTitle,
  status,
  statusLabels,
  at,
  messages,
  workingDirectory,
  keepToolBatchesExpanded = true,
  emptyHint,
  footer,
  streamTick = 0,
}: ToolTestConversationCardProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const statusLabel = badge ?? toolTestConversationStatusLabel(status, statusLabels);

  useEffect(() => {
    if (status !== "running") return;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [status, messages.length, streamTick]);

  return (
    <article
      className={`tool-test-title-run tool-test-title-run--embed tool-test-conversation-card${status === "running" ? " tool-test-title-run--running" : ""}`}
    >
      <header className="tool-test-title-run__head">
        <div className="tool-test-title-run__head-main">
          <span className="tool-test-title-run__case">{label}</span>
          <span className="tool-test-title-run__title-pill" title={badgeTitle}>
            {statusLabel}
          </span>
        </div>
        <time className="tool-test-title-run__time" dateTime={new Date(at).toISOString()}>
          {formatTitleTestRunTime(at)}
        </time>
      </header>

      <div className="tool-test-title-run__chat" aria-label="测试对话">
        <ToolTestChatMessages
          messages={messages}
          workingDirectory={workingDirectory}
          keepToolBatchesExpanded={keepToolBatchesExpanded}
          emptyHint={emptyHint}
          endRef={chatEndRef}
        />
      </div>

      {footer}
    </article>
  );
}
