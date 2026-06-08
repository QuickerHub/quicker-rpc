"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  toolTestConversationStatusLabel,
  type ToolTestConversationStatus,
} from "@/lib/tool-test-conversation-run";
import { formatTitleTestRunTime } from "@/lib/tool-test-title-runs";
import { formatLauncherAgentTimingMs } from "@/lib/tool-test-launcher-agent-timing";
import { ToolTestChatMessages } from "@/components/tool-test/ToolTestChatMessages";
import { ToolTestLauncherAgentChatMessages } from "@/components/tool-test/ToolTestLauncherAgentChatMessages";
import type { ChatAddToolOutput } from "@/lib/chat-tool-actions";

export type ToolTestConversationCardProps = {
  label: string;
  badge?: ReactNode;
  badgeTitle?: string;
  status: ToolTestConversationStatus;
  statusLabels?: { running?: string; done?: string; error?: string };
  at: number;
  /** Primary latency badge (e.g. launcher startup ms). */
  timingMs?: number;
  timingTitle?: string;
  timingLive?: boolean;
  messages: AgentUIMessage[];
  workingDirectory?: string;
  emptyHint?: string;
  footer?: ReactNode;
  /** Extra deps to auto-scroll while streaming (e.g. part count). */
  streamTick?: number;
  /** Launcher agent test: launcher-style transcript (MessageParts). */
  chatVariant?: "default" | "launcher-agent";
  chatError?: string;
  addToolOutput?: ChatAddToolOutput | null;
};

export function ToolTestConversationCard({
  label,
  badge,
  badgeTitle,
  status,
  statusLabels,
  at,
  timingMs,
  timingTitle,
  timingLive,
  messages,
  workingDirectory,
  emptyHint,
  footer,
  streamTick = 0,
  chatVariant = "default",
  chatError,
  addToolOutput,
}: ToolTestConversationCardProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
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
        <div className="tool-test-title-run__head-meta">
          {timingMs != null ? (
            <span
              className={`tool-test-title-run__timing${timingLive ? " tool-test-title-run__timing--live" : ""}`}
              title={timingTitle ?? "Agent 启动耗时"}
            >
              {formatLauncherAgentTimingMs(timingMs)}
            </span>
          ) : status === "running" ? (
            <span className="tool-test-title-run__timing tool-test-title-run__timing--pending">
              …
            </span>
          ) : null}
          <time className="tool-test-title-run__time" dateTime={new Date(at).toISOString()}>
            {formatTitleTestRunTime(at)}
          </time>
        </div>
      </header>

      <div
        ref={chatScrollRef}
        className="tool-test-title-run__chat"
        aria-label="测试对话"
      >
        {chatVariant === "launcher-agent" ? (
          <ToolTestLauncherAgentChatMessages
            messages={messages}
            workingDirectory={workingDirectory}
            emptyHint={emptyHint}
            endRef={chatEndRef}
            status={status}
            error={chatError}
            addToolOutput={addToolOutput}
          />
        ) : (
          <ToolTestChatMessages
            messages={messages}
            workingDirectory={workingDirectory}
            emptyHint={emptyHint}
            endRef={chatEndRef}
          />
        )}
      </div>

      {footer}
    </article>
  );
}
