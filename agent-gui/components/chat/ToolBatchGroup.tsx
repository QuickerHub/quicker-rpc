"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { ToolBatchMeta } from "./ToolBatchMeta";
import { ToolPart } from "./ToolPart";

type ToolBatchGroupProps = {
  messageId: string;
  items: ToolUiPartAnalysis[];
  /** True when a non-empty assistant text segment appears later in the same message. */
  hasFollowingAssistantText: boolean;
};

export function ToolBatchGroup({
  messageId,
  items,
  hasFollowingAssistantText,
}: ToolBatchGroupProps) {
  const summary = useMemo(() => buildToolBatchSummary(items), [items]);
  const shouldCollapse = shouldCollapseToolBatchWhenIdle(
    summary,
    hasFollowingAssistantText,
  );
  const batchNeedsAttention = summary.needsAttention;
  const [userOpen, setUserOpen] = useState(() => !shouldCollapse);
  const wasShouldCollapseRef = useRef(shouldCollapse);

  const batchRunning = items.some((i) => i.isRunning);
  const batchErr = items.some((i) => i.state === "output-error");
  const batchApproval = items.some((i) => i.state === "approval-requested");
  const workspaceFileBatch = isWorkspaceFileOpenBatch(items);
  const forcedOpen = batchApproval ? true : null;
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!batchRunning) return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    const frame = requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [batchRunning, items]);

  useEffect(() => {
    if (forcedOpen) return;

    if (batchRunning || batchNeedsAttention) {
      setUserOpen((open) => (open ? open : true));
    }

    if (shouldCollapse && !wasShouldCollapseRef.current) {
      setUserOpen((open) => (open ? false : open));
    }

    wasShouldCollapseRef.current = shouldCollapse;
  }, [forcedOpen, batchRunning, shouldCollapse, batchNeedsAttention]);

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
          <ToolBatchMeta
            meta={summary.meta}
            lineDiff={summary.lineDiff}
            running={batchRunning}
            error={batchErr}
            approval={batchApproval}
          />
          <span className="tool-chevron" aria-hidden />
        </span>
      }
    >
      <div
        ref={bodyRef}
        className={`tool-batch-body${batchRunning ? " tool-batch-body--active" : ""}`}
      >
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
