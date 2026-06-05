"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildToolBatchSummary,
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
  /** When true, do not auto-collapse after all tools finish (tool-test page). */
  disableAutoCollapse?: boolean;
};

export function ToolBatchGroup({
  messageId,
  items,
  disableAutoCollapse = false,
}: ToolBatchGroupProps) {
  const summary = useMemo(() => buildToolBatchSummary(items), [items]);
  const batchIdle = summary.allTerminal && !summary.needsAttention;
  const batchNeedsAttention = summary.needsAttention;
  const [userOpen, setUserOpen] = useState(
    () => disableAutoCollapse || batchNeedsAttention,
  );
  const wasIdleRef = useRef(batchIdle);
  const prevDisableAutoCollapseRef = useRef(disableAutoCollapse);

  const batchRunning = items.some((i) => i.isRunning);
  const batchErr = items.some((i) => i.state === "output-error");
  const batchApproval = items.some((i) => i.state === "approval-requested");
  const workspaceFileBatch = isWorkspaceFileOpenBatch(items);
  const forcedOpen = batchApproval ? true : null;

  useEffect(() => {
    if (disableAutoCollapse && !prevDisableAutoCollapseRef.current) {
      setUserOpen((open) => (open ? open : true));
    }
    prevDisableAutoCollapseRef.current = disableAutoCollapse;

    if (disableAutoCollapse) {
      wasIdleRef.current = batchIdle;
      if (batchNeedsAttention && !batchIdle) {
        setUserOpen((open) => (open ? open : true));
      }
      return;
    }

    if (forcedOpen) return;

    if (batchNeedsAttention && !batchIdle) {
      setUserOpen((open) => (open ? open : true));
    }

    if (batchIdle && !wasIdleRef.current) {
      setUserOpen((open) => (open ? false : open));
    }

    wasIdleRef.current = batchIdle;
  }, [disableAutoCollapse, forcedOpen, batchIdle, batchNeedsAttention]);

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
          />
        ))}
      </div>
    </ToolDisclosure>
  );
}
