"use client";

import { useMemo, useRef } from "react";
import {
  buildActionTraceTimelineRows,
  type ActionTraceTimelineRow,
} from "@/lib/action-trace-timeline-model";
import type { ActionTraceEvent } from "@/lib/action-trace-format";
import { useFollowScrollTail } from "@/lib/use-follow-scroll-tail";

type ActionTraceTimelineProps = {
  events: ActionTraceEvent[];
  isLive: boolean;
  status: "idle" | "running" | "success" | "error";
};

function kindBadge(kind: string): string {
  switch (kind) {
    case "step_begin":
      return "▶";
    case "step_end":
      return "◀";
    case "group_begin":
      return "⊞";
    case "group_end":
      return "⊟";
    case "repeat_begin":
    case "repeat_end":
      return "↻";
    case "input":
      return "in";
    case "output":
      return "out";
    case "warning":
      return "!";
    case "error":
      return "×";
    case "var_state":
      return "var";
    default:
      return "·";
  }
}

function TimelineRow({ row }: { row: ActionTraceTimelineRow }) {
  return (
    <li
      className={[
        "action-trace-timeline__row",
        `action-trace-timeline__row--${row.kind.replace(/_/g, "-")}`,
        row.running ? "action-trace-timeline__row--running" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ ["--trace-depth" as string]: row.depth }}
      data-sequence={row.event.sequence ?? row.index}
    >
      <span className="action-trace-timeline__badge" aria-hidden>
        {kindBadge(row.kind)}
      </span>
      <span className="action-trace-timeline__label" title={row.label}>
        {row.label}
      </span>
      {row.elapsedMs != null ? (
        <span className="action-trace-timeline__elapsed">{row.elapsedMs}ms</span>
      ) : null}
    </li>
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
  const followTail = isLive;

  useFollowScrollTail(
    scrollRef,
    followTail,
    rows.length,
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
        {rows.map((row) => (
          <TimelineRow key={`${row.index}-${row.event.sequence ?? 0}`} row={row} />
        ))}
      </ol>
    </div>
  );
}
