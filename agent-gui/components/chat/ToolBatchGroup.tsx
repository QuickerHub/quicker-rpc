"use client";

import { useMemo, useRef } from "react";
import { useWorkFoldFollow, useWorkFoldOpen } from "@/lib/use-work-fold-interaction";
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
  const { open, setOpen } = useWorkFoldOpen(!shouldCollapse);

  const batchRunning = items.some((i) => i.isRunning);
  const batchErr = items.some((i) => i.state === "output-error");
  const batchApproval = items.some((i) => i.state === "approval-requested");
  const workspaceFileBatch = isWorkspaceFileOpenBatch(items);
  const bodyRef = useRef<HTMLDivElement>(null);
  const followHandlers = useWorkFoldFollow(bodyRef, batchRunning && (batchApproval || open), items);

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
      open={open}
      onOpenChange={setOpen}
      forcedOpen={batchApproval ? true : null}
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
        {...followHandlers}
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
