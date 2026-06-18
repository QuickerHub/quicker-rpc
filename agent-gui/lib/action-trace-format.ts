/** Mirrors QuickerRpc.Console ActionTraceCli.FormatHuman for agent-gui terminal display. */

export type ActionTraceEvent = {
  sequence?: number;
  kind?: string;
  depth?: number;
  stepId?: string | null;
  stepPath?: string | null;
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

function readTraceField(
  obj: Record<string, unknown>,
  camelKey: string,
  pascalKey: string,
): unknown {
  if (camelKey in obj) return obj[camelKey];
  if (pascalKey in obj) return obj[pascalKey];
  return undefined;
}

function readTraceString(
  obj: Record<string, unknown>,
  camelKey: string,
  pascalKey: string,
): string | null | undefined {
  const value = readTraceField(obj, camelKey, pascalKey);
  if (value == null) return value as null | undefined;
  return typeof value === "string" ? value : undefined;
}

function readTraceNumber(
  obj: Record<string, unknown>,
  camelKey: string,
  pascalKey: string,
): number | undefined {
  const value = readTraceField(obj, camelKey, pascalKey);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Unwrap CLI / tool JSON envelopes to a raw trace event object. */
export function unwrapActionTracePayload(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return raw;
  }

  const obj = raw as Record<string, unknown>;
  const type = readTraceString(obj, "type", "Type");
  if (type === "trace") {
    const nested = readTraceField(obj, "trace", "Trace");
    if (nested != null) return nested;
  }

  return raw;
}

/** Parse one JSON object / NDJSON line into ActionTraceEvent. */
export function parseActionTraceEvent(raw: unknown): ActionTraceEvent | null {
  const unwrapped = unwrapActionTracePayload(raw);
  if (typeof unwrapped !== "object" || unwrapped === null || Array.isArray(unwrapped)) {
    return null;
  }

  const obj = unwrapped as Record<string, unknown>;
  const kind = readTraceString(obj, "kind", "Kind") ?? "";
  if (!kind) return null;

  return {
    sequence: readTraceNumber(obj, "sequence", "Sequence"),
    kind,
    depth: readTraceNumber(obj, "depth", "Depth"),
    stepId: readTraceString(obj, "stepId", "StepId"),
    stepPath: readTraceString(obj, "stepPath", "StepPath"),
    stepRunnerKey: readTraceString(obj, "stepRunnerKey", "StepRunnerKey"),
    stepRunnerName: readTraceString(obj, "stepRunnerName", "StepRunnerName"),
    note: readTraceString(obj, "note", "Note"),
    message: readTraceString(obj, "message", "Message"),
    paramKey: readTraceString(obj, "paramKey", "ParamKey"),
    paramExpression: readTraceString(obj, "paramExpression", "ParamExpression"),
    paramValue: readTraceString(obj, "paramValue", "ParamValue"),
    varName: readTraceString(obj, "varName", "VarName"),
    varKey: readTraceString(obj, "varKey", "VarKey"),
    elapsedMs: readTraceNumber(obj, "elapsedMs", "ElapsedMs"),
  };
}

/** Parse trace arrays or completed run JSON (`{ events: [...] }`). */
export function parseActionTraceEvents(raw: unknown): ActionTraceEvent[] {
  if (Array.isArray(raw)) {
    const events: ActionTraceEvent[] = [];
    for (const item of raw) {
      const parsed = parseActionTraceEvent(item);
      if (parsed) events.push(parsed);
    }
    return events;
  }

  if (typeof raw !== "object" || raw === null) {
    return [];
  }

  const obj = raw as Record<string, unknown>;
  const nestedEvents = readTraceField(obj, "events", "Events");
  if (Array.isArray(nestedEvents)) {
    return parseActionTraceEvents(nestedEvents);
  }

  const single = parseActionTraceEvent(obj);
  return single ? [single] : [];
}

/** Parse NDJSON / mixed trace text into structured events. */
export function parseActionTraceJsonLines(text: string): ActionTraceEvent[] {
  const events: ActionTraceEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    try {
      const parsed = parseActionTraceEvent(JSON.parse(trimmed));
      if (parsed) events.push(parsed);
    } catch {
      continue;
    }
  }
  return events;
}
