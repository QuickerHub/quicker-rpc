/** Mirrors QuickerRpc.Console ActionTraceCli.FormatHuman for agent-gui terminal display. */

export type ActionTraceEvent = {
  sequence?: number;
  kind?: string;
  depth?: number;
  stepId?: string | null;
  stepRunnerKey?: string | null;
  stepRunnerName?: string | null;
  note?: string | null;
  message?: string | null;
  paramKey?: string | null;
  paramExpression?: string | null;
  paramValue?: string | null;
  varName?: string | null;
  varKey?: string | null;
  elapsedMs?: number;
};

export function formatTraceEventLine(traceEvent: ActionTraceEvent): string {
  const depth = Math.max(0, traceEvent.depth ?? 0);
  const indent = " ".repeat(depth * 2);
  const kind = traceEvent.kind ?? "";
  const prefix = (() => {
    switch (kind) {
      case "step_begin":
        return ">";
      case "step_end":
        return "<";
      case "group_begin":
        return "[+";
      case "group_end":
        return "[-";
      case "repeat_begin":
      case "repeat_end":
        return "~";
      case "input":
        return " in";
      case "output":
        return "out";
      case "info":
        return " .";
      case "warning":
        return " !";
      case "error":
        return " X";
      case "var_state":
        return "var";
      default:
        return " .";
    }
  })();

  const head = (() => {
    switch (kind) {
      case "step_begin":
        return buildStepHead(traceEvent);
      case "input":
        return buildInputHead(traceEvent);
      case "output":
        return buildOutputHead(traceEvent);
      case "var_state":
        return `{${traceEvent.varKey ?? ""}}=${traceEvent.paramValue ?? ""}`;
      default:
        return traceEvent.message ?? traceEvent.note ?? kind;
    }
  })();

  const elapsed =
    (traceEvent.elapsedMs ?? 0) > 0 ? ` +${traceEvent.elapsedMs}ms` : "";
  return `${indent}${prefix} ${head}${elapsed}`;
}

function buildStepHead(traceEvent: ActionTraceEvent): string {
  const name =
    traceEvent.stepRunnerName?.trim()
    || traceEvent.stepRunnerKey?.trim()
    || "step";
  const note = traceEvent.note?.trim();
  if (note) {
    return `${name} - ${note}`;
  }
  return name;
}

function buildInputHead(traceEvent: ActionTraceEvent): string {
  const key = traceEvent.paramKey ?? "param";
  const expr = traceEvent.paramExpression?.trim();
  const value = traceEvent.paramValue ?? "";
  if (expr && expr !== value) {
    return `${key}: ${expr} => ${value}`;
  }
  return `${key}=${value}`;
}

function buildOutputHead(traceEvent: ActionTraceEvent): string {
  const key = traceEvent.paramKey ?? "out";
  const target = traceEvent.varName?.trim() || key;
  return `${target}=${traceEvent.paramValue ?? ""}`;
}

export function formatTraceEventsToText(events: ActionTraceEvent[]): string {
  if (!events.length) return "";
  return events.map((event) => formatTraceEventLine(event)).join("\n");
}

/** Parse SSE / tool JSON payload into ActionTraceEvent. */
export function parseActionTraceEvent(raw: unknown): ActionTraceEvent | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const kind = typeof obj.kind === "string" ? obj.kind : "";
  if (!kind) return null;

  const readString = (key: string): string | null | undefined => {
    const value = obj[key];
    if (value == null) return value as null | undefined;
    return typeof value === "string" ? value : undefined;
  };

  return {
    sequence: typeof obj.sequence === "number" ? obj.sequence : undefined,
    kind,
    depth: typeof obj.depth === "number" ? obj.depth : undefined,
    stepId: readString("stepId"),
    stepRunnerKey: readString("stepRunnerKey"),
    stepRunnerName: readString("stepRunnerName"),
    note: readString("note"),
    message: readString("message"),
    paramKey: readString("paramKey"),
    paramExpression: readString("paramExpression"),
    paramValue: readString("paramValue"),
    varName: readString("varName"),
    varKey: readString("varKey"),
    elapsedMs: typeof obj.elapsedMs === "number" ? obj.elapsedMs : undefined,
  };
}

export function parseActionTraceEvents(raw: unknown): ActionTraceEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: ActionTraceEvent[] = [];
  for (const item of raw) {
    const parsed = parseActionTraceEvent(item);
    if (parsed) events.push(parsed);
  }
  return events;
}
