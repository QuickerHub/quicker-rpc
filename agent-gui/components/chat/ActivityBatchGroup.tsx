"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildActivityBatchSummary,
  type ActivitySegmentItem,
  type ReasoningSegmentItem,
  type ToolUiPartAnalysis,
} from "./tool-part-layout";
import { ReasoningPart } from "./ReasoningPart";
import { readToolCallId } from "@/lib/workspace-tool-auto-open";
import { ToolDisclosure } from "./ToolDisclosure";
import { ToolBatchMeta } from "./ToolBatchMeta";
import { ToolPart } from "./ToolPart";

type ActivityBatchGroupProps = {
  messageId: string;
  items: ActivitySegmentItem[];
};

type VisibleActivityRow =
  | { kind: "reasoning-run"; items: ReasoningSegmentItem[] }
  | { kind: "tool"; item: ToolUiPartAnalysis };

const ACTIVITY_VIRTUAL_TAIL = 10;
const ACTIVITY_VIRTUALIZE_AT = ACTIVITY_VIRTUAL_TAIL + 8;
const ACTIVITY_DEVIRTUALIZE_AT = ACTIVITY_VIRTUAL_TAIL + 4;

function groupVisibleActivityRows(
  items: ActivitySegmentItem[],
): VisibleActivityRow[] {
  const rows: VisibleActivityRow[] = [];
  let reasoningRun: ReasoningSegmentItem[] = [];

  const flushReasoning = () => {
    if (reasoningRun.length === 0) return;
    rows.push({ kind: "reasoning-run", items: reasoningRun });
    reasoningRun = [];
  };

  for (const item of items) {
    if (item.kind === "reasoning") {
      reasoningRun.push({ part: item.part, index: item.index });
      continue;
    }
    flushReasoning();
    rows.push({ kind: "tool", item });
  }
  flushReasoning();
  return rows;
}

function buildActivityBatchScrollKey(items: ActivitySegmentItem[]): string {
  const tail = items.slice(-ACTIVITY_VIRTUAL_TAIL - 2);
  return tail
    .map((item) => {
      if (item.kind === "reasoning") {
        const text =
          "text" in item.part && typeof item.part.text === "string"
            ? item.part.text.length
            : 0;
        const state =
          "state" in item.part && typeof item.part.state === "string"
            ? item.part.state
            : "";
        return `r:${item.index}:${state}:${text}`;
      }
      return `t:${item.index}:${item.state}:${item.isRunning ? 1 : 0}`;
    })
    .join("|");
}

export function ActivityBatchGroup({
  messageId,
  items,
}: ActivityBatchGroupProps) {
  const summary = useMemo(() => buildActivityBatchSummary(items), [items]);
  const batchNeedsAttention = summary.needsAttention;
  const [userOpen, setUserOpen] = useState(true);
  const virtualizedRef = useRef(false);

  const batchRunning = items.some(
    (item) => item.kind === "tool" && item.isRunning,
  );
  const shouldVirtualizeActivity =
    batchRunning
    && (virtualizedRef.current
      ? items.length > ACTIVITY_DEVIRTUALIZE_AT
      : items.length > ACTIVITY_VIRTUALIZE_AT);
  if (batchRunning) {
    virtualizedRef.current = shouldVirtualizeActivity;
  } else {
    virtualizedRef.current = false;
  }

  const omittedActivityCount = shouldVirtualizeActivity
    ? items.length - ACTIVITY_VIRTUAL_TAIL
    : 0;
  const visibleActivityItems = shouldVirtualizeActivity
    ? items.slice(-ACTIVITY_VIRTUAL_TAIL)
    : items;
  const visibleRows = useMemo(
    () => groupVisibleActivityRows(visibleActivityItems),
    [visibleActivityItems],
  );
  const scrollTailKey = useMemo(
    () => buildActivityBatchScrollKey(items),
    [items],
  );

  const batchErr = items.some(
    (item) => item.kind === "tool" && item.state === "output-error",
  );
  const batchApproval = items.some(
    (item) => item.kind === "tool" && item.state === "approval-requested",
  );
  const batchActive = batchRunning || summary.reasoningStreaming;
  const forcedOpen = batchApproval ? true : null;
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!batchActive) return;
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    const frame = requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [batchActive, scrollTailKey]);

  useEffect(() => {
    if (forcedOpen) return;
    if (batchActive || batchNeedsAttention) {
      setUserOpen((open) => (open ? open : true));
    }
  }, [forcedOpen, batchActive, batchNeedsAttention]);

  return (
    <ToolDisclosure
      className="tool-batch activity-batch explore-batch"
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
            running={batchRunning || summary.reasoningStreaming}
            error={batchErr}
            approval={batchApproval}
          />
          <span className="tool-chevron" aria-hidden />
        </span>
      }
    >
      <div
        ref={bodyRef}
        className={`tool-batch-body activity-batch-body explore-batch-body${batchActive ? " explore-batch-body--active" : ""}`}
      >
        {omittedActivityCount > 0 ? (
          <div className="activity-batch-omitted" aria-hidden>
            另有 {omittedActivityCount} 步已省略（流式加载中）
          </div>
        ) : null}
        {visibleRows.map((row) => {
          if (row.kind === "reasoning-run") {
            const key = row.items.map((item) => item.index).join("-");
            return (
              <ReasoningPart
                key={`reasoning-${messageId}-${key}`}
                items={row.items}
              />
            );
          }

          const toolCallId = readToolCallId(row.item.part);
          return (
            <ToolPart
              key={toolCallId ?? `tool-${messageId}-${row.item.index}`}
              messageId={messageId}
              partIndex={row.item.index}
              part={row.item.part}
              inBatch
            />
          );
        })}
      </div>
    </ToolDisclosure>
  );
}
