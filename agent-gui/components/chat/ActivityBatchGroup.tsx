"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  buildActivityBatchSummary,
  type ActivitySegmentItem,
} from "./tool-part-layout";
import { ReasoningPart } from "./ReasoningPart";
import { readToolCallId } from "@/lib/workspace-tool-auto-open";
import { ToolDisclosure } from "./ToolDisclosure";
import { ToolPart } from "./ToolPart";

type ActivityBatchGroupProps = {
  messageId: string;
  items: ActivitySegmentItem[];
};

export function ActivityBatchGroup({
  messageId,
  items,
}: ActivityBatchGroupProps) {
  const summary = useMemo(() => buildActivityBatchSummary(items), [items]);
  const batchNeedsAttention = summary.needsAttention;
  const [userOpen, setUserOpen] = useState(true);

  const batchRunning = items.some(
    (item) => item.kind === "tool" && item.isRunning,
  );
  const ACTIVITY_VIRTUAL_TAIL = 10;
  const shouldVirtualizeActivity =
    batchRunning && items.length > ACTIVITY_VIRTUAL_TAIL + 4;
  const omittedActivityCount = shouldVirtualizeActivity
    ? items.length - ACTIVITY_VIRTUAL_TAIL
    : 0;
  const visibleActivityItems = shouldVirtualizeActivity
    ? items.slice(-ACTIVITY_VIRTUAL_TAIL)
    : items;
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
  }, [batchActive, items, visibleActivityItems]);

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
          <span
            className={`tool-meta${batchRunning || summary.reasoningStreaming ? " tool-meta--running" : ""}${batchErr ? " tool-meta--err" : ""}${batchApproval ? " tool-meta--approval" : ""}`}
          >
            {summary.meta}
          </span>
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
        {visibleActivityItems.map((item) => {
          if (item.kind === "reasoning") {
            const key = `reasoning-${messageId}-${item.index}`;
            return (
              <ReasoningPart
                key={key}
                items={[{ part: item.part, index: item.index }]}
                inBatch
              />
            );
          }

          const toolCallId = readToolCallId(item.part);
          return (
            <ToolPart
              key={toolCallId ?? `tool-${messageId}-${item.index}`}
              messageId={messageId}
              partIndex={item.index}
              part={item.part}
              inBatch
            />
          );
        })}
      </div>
    </ToolDisclosure>
  );
}
