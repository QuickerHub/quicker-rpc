import {
  formatTraceEventLine,
  type ActionTraceEvent,
} from "@/lib/action-trace-format";

export type ActionTraceTimelineRow = {
  index: number;
  event: ActionTraceEvent;
  label: string;
  kind: string;
  depth: number;
  elapsedMs?: number;
  running: boolean;
};

export function buildActionTraceTimelineRows(
  events: ActionTraceEvent[],
  isLive: boolean,
): ActionTraceTimelineRow[] {
  return events.map((event, index) => {
    const kind = event.kind ?? "info";
    return {
      index,
      event,
      kind,
      depth: Math.max(0, event.depth ?? 0),
      label: formatTraceTimelineLabel(event),
      elapsedMs: (event.elapsedMs ?? 0) > 0 ? event.elapsedMs : undefined,
      running: isLive && isStepBeginRunning(events, index),
    };
  });
}

export function formatTraceTimelineLabel(event: ActionTraceEvent): string {
  const kind = event.kind ?? "";
  switch (kind) {
    case "step_begin": {
      const name =
        event.stepRunnerName?.trim()
        || event.stepRunnerKey?.trim()
        || "step";
      const note = event.note?.trim();
      return note ? `${name} · ${note}` : name;
    }
    case "step_end":
      return event.message?.trim() || event.note?.trim() || "完成";
    case "group_begin":
    case "group_end":
      return event.message?.trim() || event.note?.trim() || kind;
    case "input": {
      const key = event.paramKey ?? "param";
      const expr = event.paramExpression?.trim();
      const value = event.paramValue ?? "";
      if (expr && expr !== value) {
        return `${key}: ${expr} → ${value}`;
      }
      return `${key} = ${value}`;
    }
    case "output": {
      const key = event.paramKey ?? "out";
      const target = event.varName?.trim() || key;
      return `${target} = ${event.paramValue ?? ""}`;
    }
    case "var_state":
      return `{${event.varKey ?? ""}} = ${event.paramValue ?? ""}`;
    default:
      return event.message?.trim() || event.note?.trim() || formatTraceEventLine(event);
  }
}

export function isStepBeginRunning(
  events: ActionTraceEvent[],
  index: number,
): boolean {
  const event = events[index];
  if (event?.kind !== "step_begin") return false;
  const stepId = event.stepId?.trim();
  if (!stepId) return index === events.length - 1;
  for (let i = index + 1; i < events.length; i += 1) {
    const next = events[i];
    if (next?.kind === "step_end" && next.stepId === stepId) {
      return false;
    }
  }
  return true;
}
