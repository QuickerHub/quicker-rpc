"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatAddToolApproveResponseFunction } from "ai";
import {
  buildToolBatchSummary,
  shouldCollapseToolBatchWhenIdle,
  type ToolUiPartAnalysis,
} from "./tool-part-layout";
import {
  isWorkspaceFileOpenBatch,
  WorkspaceFileBatchRow,
} from "./WorkspaceFileOpenRow";
import { readToolCallId } from "@/lib/workspace-tool-auto-open";
import { ToolDisclosure } from "./ToolDisclosure";
import { ToolPart } from "./ToolPart";

type ToolBatchGroupProps = {
  messageId: string;
  items: ToolUiPartAnalysis[];
  addToolApprovalResponse?: ChatAddToolApproveResponseFunction;
  approvalDisabled?: boolean;
};

export function ToolBatchGroup({
  messageId,
  items,
  addToolApprovalResponse,
  approvalDisabled,
}: ToolBatchGroupProps) {
  const summary = useMemo(() => buildToolBatchSummary(items), [items]);
  const [userOpen, setUserOpen] = useState(() => summary.needsAttention);
  const wasIdleRef = useRef(shouldCollapseToolBatchWhenIdle(summary));

  const batchRunning = items.some((i) => i.isRunning);
  const batchErr = items.some((i) => i.state === "output-error");
  const batchApproval = items.some((i) => i.state === "approval-requested");
  const workspaceFileBatch = isWorkspaceFileOpenBatch(items);
  const forcedOpen = batchApproval ? true : null;

  useEffect(() => {
    if (forcedOpen) return;
    const idle = shouldCollapseToolBatchWhenIdle(summary);

    if (summary.needsAttention && !idle) {
      setUserOpen(true);
    }

    if (idle && !wasIdleRef.current) {
      setUserOpen(false);
    }

    wasIdleRef.current = idle;
  }, [forcedOpen, summary]);

  if (workspaceFileBatch && !batchApproval) {
    return (
      <WorkspaceFileBatchRow
        items={items.map((item) => ({
          name: item.name,
          displayName: item.displayName,
          meta: item.meta,
          isRunning: item.isRunning,
          state: item.state,
          part: item.part,
        }))}
      />
    );
  }

  return (
    <ToolDisclosure
      className="tool-batch"
      open={userOpen}
      onOpenChange={setUserOpen}
      forcedOpen={forcedOpen}
      summaryClassName="tool-batch-summary"
      expandedClassName="tool-batch--expanded"
      collapsedClassName="tool-batch--collapsed"
      summary={
        <span className="tool-title">
          <span className="tool-name">{summary.title}</span>
          <span
            className={`tool-meta${batchRunning ? " tool-meta--running" : ""}${batchErr ? " tool-meta--err" : ""}${batchApproval ? " tool-meta--approval" : ""}`}
          >
            {summary.meta}
          </span>
          <span className="tool-chevron" aria-hidden />
        </span>
      }
    >
      <div className="tool-batch-body">
        {items.map((item) => (
          <ToolPart
            key={readToolCallId(item.part) ?? `tool-${messageId}-${item.index}`}
            messageId={messageId}
            partIndex={item.index}
            part={item.part}
            inBatch
            addToolApprovalResponse={addToolApprovalResponse}
            approvalDisabled={approvalDisabled}
          />
        ))}
      </div>
    </ToolDisclosure>
  );
}
