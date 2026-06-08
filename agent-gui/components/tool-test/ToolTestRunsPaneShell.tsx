"use client";

import { useCallback, type ReactNode } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import { flattenChatMessagesFromRuns } from "@/lib/tool-test-chat-cleanup";
import {
  isToolTestConversationRunBusy,
  type ToolTestConversationStatus,
} from "@/lib/tool-test-conversation-run";
import { useToolTestSessionCleanup } from "@/lib/use-tool-test-session-cleanup";

type ToolTestRunsPaneShellProps = {
  className?: string;
  heading: string;
  subText: string;
  emptyText: string;
  runs: ReadonlyArray<{
    status: ToolTestConversationStatus;
    chatMessages?: AgentUIMessage[];
  }>;
  workingDirectory?: string;
  onClearRuns: () => void;
  clearedLabel?: string;
  cleanupDisabled?: boolean;
  children: ReactNode;
  streamAnchorRef?: React.RefObject<HTMLDivElement | null>;
  /** Use provider-owned cleanup (e.g. prompt-chat) instead of the built-in hook. */
  externalCleanup?: {
    cleanupSession: () => void | Promise<void>;
    cleanupBusy: boolean;
    cleanupHint: string | null;
    canCleanup: boolean;
  };
};

export function ToolTestRunsPaneShell({
  className,
  heading,
  subText,
  emptyText,
  runs,
  workingDirectory,
  onClearRuns,
  clearedLabel = "已清空记录",
  cleanupDisabled = false,
  children,
  streamAnchorRef,
  externalCleanup,
}: ToolTestRunsPaneShellProps) {
  const runBusy = isToolTestConversationRunBusy(runs);

  const getMessages = useCallback(
    () => flattenChatMessagesFromRuns(runs),
    [runs],
  );

  const internalCleanup = useToolTestSessionCleanup({
    workingDirectory,
    getMessages,
    onCleared: onClearRuns,
    clearedLabel,
  });

  const cleanupSession =
    externalCleanup?.cleanupSession ?? internalCleanup.cleanupSession;
  const cleanupBusy =
    externalCleanup?.cleanupBusy ?? internalCleanup.cleanupBusy;
  const cleanupHint =
    externalCleanup?.cleanupHint ?? internalCleanup.cleanupHint;
  const canCleanup =
    externalCleanup?.canCleanup
    ?? (runs.length > 0 && !runBusy && !cleanupBusy && !cleanupDisabled);

  return (
    <main
      className={["tool-test-title-pane", className ?? ""].filter(Boolean).join(" ")}
    >
      <header className="tool-test-title-pane__head">
        <h2 className="tool-test-title-pane__heading">{heading}</h2>
        <div className="tool-test-pane-toolbar">
          <p className="tool-test-title-pane__sub">{subText}</p>
          {runs.length > 0 ? (
            <button
              type="button"
              className="tool-test-pane-toolbar__action tool-test-pane-toolbar__action--danger"
              disabled={!canCleanup}
              onClick={() => void cleanupSession()}
            >
              {cleanupBusy ? "清理中…" : "一键清理"}
            </button>
          ) : null}
        </div>
      </header>

      {cleanupHint ? (
        <p className="tool-test-prompt-chat__cleanup-hint" role="status">
          {cleanupHint}
        </p>
      ) : null}

      <div className="tool-test-title-stream">
        {runs.length === 0 ? (
          <p className="tool-test-title-pane__empty">{emptyText}</p>
        ) : (
          children
        )}
        <div
          ref={streamAnchorRef}
          className="tool-test-title-stream__anchor"
          aria-hidden
        />
      </div>
    </main>
  );
}
