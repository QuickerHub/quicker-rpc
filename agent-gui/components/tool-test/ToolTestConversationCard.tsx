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
import { ContextUsage } from "@/components/chat/ContextUsage";
import type { ToolTestExportMeta } from "@/lib/tool-test-chat-export";
import type { ChatThreadExportResult } from "@/components/chat/ChatThreadExportDialog";

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
  /** Show context ring (same as main chat composer). */
  llmSelection?: string;
  /** Enable export button when set. */
  exportMeta?: ToolTestExportMeta;
  exportResult?: ChatThreadExportResult | null;
  exporting?: boolean;
  onExport?: () => void;
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
  llmSelection,
  exportMeta,
  exportResult,
  exporting = false,
  onExport,
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
          {llmSelection?.trim() ? (
            <ContextUsage
              messages={messages}
              busy={status === "running"}
              selection={llmSelection}
              compact
            />
          ) : null}
          {exportMeta && onExport ? (
            <button
              type="button"
              className="tool-test-title-run__export-btn"
              disabled={exporting || messages.length === 0}
              title="导出 quicker-agent-*.json 到 QuickerAgent exports"
              onClick={onExport}
            >
              {exporting ? "导出中…" : "导出"}
            </button>
          ) : null}
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

      {exportResult?.filename ? (
        <p className="tool-test-title-run__export-hint" role="status">
          已导出 <code>{exportResult.filename}</code>
          {exportResult.exportsDirectory ? (
            <span className="tool-test-title-run__export-dir">
              {" "}
              → {exportResult.exportsDirectory}
            </span>
          ) : null}
        </p>
      ) : null}

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
