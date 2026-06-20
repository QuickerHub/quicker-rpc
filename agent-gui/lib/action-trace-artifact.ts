import {
  type ActionTraceEvent,
  formatTraceEventsToText,
  parseActionTraceEvents,
} from "@/lib/action-trace-format";

export const ACTION_TRACE_ARTIFACT_FORMAT = "action-trace-v1";
export const ACTION_TRACE_STEP_SUMMARY_CAP = 20;

export type ActionTraceRef = {
  path: string;
  format: typeof ACTION_TRACE_ARTIFACT_FORMAT;
};

export type ActionTraceStepSummary = {
  name: string;
  elapsedMs?: number;
  stepPath?: string;
};

export type ActionTraceArtifactDocument = {
  version: 1;
  actionId: string;
  param?: string;
  ok: boolean;
  durationMs?: number;
  eventCount: number;
  events: ActionTraceEvent[];
  text?: string;
  message?: string;
  errorMessage?: string;
  returnResult?: string;
  failureLocation?: unknown;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function sanitizeActionIdForArtifactPath(actionId: string): string {
  return actionId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "_");
}

export function buildActionTraceArtifactPath(actionId: string, traceId: string): string {
  const safeId = sanitizeActionIdForArtifactPath(actionId);
  const safeTraceId = traceId.trim().replace(/[^a-z0-9-]/gi, "_");
  return `.local/action-trace/${safeId}/${safeTraceId}.json`;
}

export function buildActionTraceStepSummaries(
  events: ActionTraceEvent[],
): ActionTraceStepSummary[] {
  const summaries: ActionTraceStepSummary[] = [];
  for (const event of events) {
    if (event.kind !== "step_begin") continue;
    const name =
      event.stepRunnerName?.trim()
      || event.note?.trim()
      || event.stepRunnerKey?.trim()
      || "step";
    summaries.push({
      name,
      ...(event.elapsedMs != null && event.elapsedMs > 0
        ? { elapsedMs: event.elapsedMs }
        : {}),
      ...(event.stepPath?.trim() ? { stepPath: event.stepPath.trim() } : {}),
    });
    if (summaries.length >= ACTION_TRACE_STEP_SUMMARY_CAP) break;
  }
  return summaries;
}

export function buildActionTraceArtifactDocument(
  data: Record<string, unknown>,
  options: { actionId: string; param?: string; events: ActionTraceEvent[] },
): ActionTraceArtifactDocument {
  const eventCount =
    typeof data.eventCount === "number" ? data.eventCount : options.events.length;
  const durationMs =
    typeof data.durationMs === "number" ? data.durationMs : undefined;
  return {
    version: 1,
    actionId: options.actionId.trim(),
    param: options.param?.trim() || undefined,
    ok: data.ok !== false,
    durationMs,
    eventCount,
    events: options.events,
    text: formatTraceEventsToText(options.events),
    message: readString(data.message),
    errorMessage: readString(data.errorMessage),
    returnResult: readString(data.returnResult),
    failureLocation: data.failureLocation,
  };
}

export function readActionTraceRef(value: unknown): ActionTraceRef | null {
  const record = readRecord(value);
  if (!record) return null;
  const path = readString(record.path);
  if (!path) return null;
  const format = readString(record.format);
  if (format !== ACTION_TRACE_ARTIFACT_FORMAT) return null;
  return { path, format: ACTION_TRACE_ARTIFACT_FORMAT };
}

export function parseActionTraceArtifactDocument(raw: string): ActionTraceArtifactDocument | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const record = readRecord(parsed);
    if (!record || record.version !== 1) return null;
    const actionId = readString(record.actionId);
    if (!actionId) return null;
    const events = parseActionTraceEvents(record.events);
    const eventCount =
      typeof record.eventCount === "number" ? record.eventCount : events.length;
    return {
      version: 1,
      actionId,
      param: readString(record.param),
      ok: record.ok !== false,
      durationMs:
        typeof record.durationMs === "number" ? record.durationMs : undefined,
      eventCount,
      events,
      text: readString(record.text),
      message: readString(record.message),
      errorMessage: readString(record.errorMessage),
      returnResult: readString(record.returnResult),
      failureLocation: record.failureLocation,
    };
  } catch {
    return null;
  }
}
