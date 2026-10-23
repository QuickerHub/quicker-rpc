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
  const isBatch = items.length > 1;
  const workspaceFileBatch = isBatch && isWorkspaceFileOpenBatch(items) && !batchApproval;
  // Aggregate file rows have their own existing entry point. Retain only call
  // owners that were actually presented before aggregation, not hidden previews
  // for every file in an initially collapsed historical batch.
  const presentedCalls = useRef(new Set<string>());
  const callKey = (item: ToolUiPartAnalysis) =>
    readToolCallId(item.part) ?? `tool-${messageId}-${item.index}`;
  if (!workspaceFileBatch) {
    for (const item of items) presentedCalls.current.add(callKey(item));
  }
  const presentedItems = workspaceFileBatch
    ? items.filter((item) => presentedCalls.current.has(callKey(item)))
    : items;
  const bodyRef = useRef<HTMLDivElement>(null);
  const followHandlers = useWorkFoldFollow(bodyRef, isBatch && !workspaceFileBatch && batchRunning && (batchApproval || open), items);

  return (
    <>
      {workspaceFileBatch ? (
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
      ) : null}
    <div hidden={workspaceFileBatch}>
    <ToolDisclosure
      className={isBatch ? "tool-batch" : undefined}
      open={open}
      onOpenChange={setOpen}
      forcedOpen={!isBatch || batchApproval ? true : null}
      summaryHidden={!isBatch}
      keepMounted
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
        className={isBatch ? `tool-batch-body${batchRunning ? " tool-batch-body--active" : ""}` : undefined}
      >
        {presentedItems.map((item) => (
          <ToolPart
            key={callKey(item)}
            messageId={messageId}
            partIndex={item.index}
            part={item.part}
            inBatch={isBatch}
          />
        ))}
      </div>
    </ToolDisclosure>
    </div>
    </>
  );
}
