"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { ActionTraceTimelineRowView } from "@/components/action-trace/ActionTraceTimelineRow";
import { LoopTraceModule } from "@/components/action-trace/LoopTraceModule";
import { RepeatStepTraceSection } from "@/components/action-trace/RepeatStepTraceSection";
import {
  buildTimelineDisplayItems,
  type TimelineDisplayItem,
} from "@/lib/action-trace-timeline-collapse";
import { buildActionTraceTimelineRows } from "@/lib/action-trace-timeline-model";
import type { ActionTraceEvent } from "@/lib/action-trace-format";
import { useFollowScrollTail } from "@/lib/use-follow-scroll-tail";

type ActionTraceTimelineProps = {
  events: ActionTraceEvent[];
  isLive: boolean;
  status: "idle" | "running" | "success" | "error";
};

function renderDisplayItem(
  item: TimelineDisplayItem,
  context: {
    events: ActionTraceEvent[];
    rows: ReturnType<typeof buildActionTraceTimelineRows>;
    isLive: boolean;
    runningRowIndex: number | null;
  },
): ReactNode {
  if (item.kind === "row") {
    return (
      <ActionTraceTimelineRowView
        key={`row-${item.row.index}-${item.row.event.sequence ?? 0}`}
        row={item.row}
      />
    );
  }

  if (item.kind === "repeat-step-section") {
    return (
      <RepeatStepTraceSection
        key={item.model.id}
        model={item.model}
        rows={context.rows}
        events={context.events}
        isLive={context.isLive}
        runningRowIndex={context.runningRowIndex}
      />
    );
  }

  return (
    <LoopTraceModule
      key={item.model.id}
      model={item.model}
      rows={context.rows}
      events={context.events}
      isLive={context.isLive}
      runningRowIndex={context.runningRowIndex}
    />
  );
}

export function ActionTraceTimeline({
  events,
  isLive,
  status,
}: ActionTraceTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(
    () => buildActionTraceTimelineRows(events, isLive),
    [events, isLive],
  );
  const runningRowIndex = useMemo(() => {
    const index = rows.findIndex((row) => row.running);
    return index >= 0 ? index : null;
  }, [rows]);
  const displayItems = useMemo(
    () =>
      buildTimelineDisplayItems(rows, events, isLive, runningRowIndex),
    [rows, events, isLive, runningRowIndex],
  );
  const followTail = isLive;

  useFollowScrollTail(
    scrollRef,
    followTail,
    displayItems.length,
    status,
    events.length,
  );

  if (!rows.length) {
    return (
      <div className="action-trace-timeline action-trace-timeline--empty">
        <p className="action-trace-timeline__placeholder tool-muted">
          {isLive ? "等待 trace 事件…" : "暂无步骤事件"}
        </p>
      </div>
    );
  }

  const renderContext = {
    events,
    rows,
    isLive,
    runningRowIndex,
  };

  return (
    <div
      ref={scrollRef}
      className={[
        "action-trace-timeline",
        isLive ? "action-trace-timeline--live" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ol className="action-trace-timeline__list">
        {displayItems.map((item) => renderDisplayItem(item, renderContext))}
      </ol>
    </div>
  );
}
