"use client";

import type { ActionTraceTimelineRow } from "@/lib/action-trace-timeline-model";

export function traceKindBadge(kind: string): string {
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

export function ActionTraceTimelineRowView({
  row,
  as = "li",
}: {
  row: ActionTraceTimelineRow;
  as?: "li" | "div";
}) {
  const className = [
    "action-trace-timeline__row",
    `action-trace-timeline__row--${row.kind.replace(/_/g, "-")}`,
    row.running ? "action-trace-timeline__row--running" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const props = {
    className,
    style: { ["--trace-depth" as string]: row.depth },
    "data-sequence": row.event.sequence ?? row.index,
  };
  const content = (
    <>
      <span className="action-trace-timeline__badge" aria-hidden>
        {traceKindBadge(row.kind)}
      </span>
      <span className="action-trace-timeline__label" title={row.label}>
        {row.label}
      </span>
      {row.elapsedMs != null ? (
        <span className="action-trace-timeline__elapsed">{row.elapsedMs}ms</span>
      ) : null}
    </>
  );

  if (as === "div") {
    return <div {...props}>{content}</div>;
  }

  return <li {...props}>{content}</li>;
}
