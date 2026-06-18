import type { ActionTraceEvent } from "@/lib/action-trace-format";
import { parseActionTraceEvents } from "@/lib/action-trace-format";
import { computeProgramStepDiskSlice } from "@/lib/action-editor/program/stepDiskSlice";

export type ProgramStepWalkEntry = {
  nodePath: string;
  stepRunnerKey: string;
  note?: string;
  stepId?: string;
};

export type ActionTraceFailureContext = {
  message: string;
  kind: "error" | "warning" | "run_failed";
  stepId?: string;
  stepPath?: string;
  stepRunnerKey?: string;
  stepRunnerName?: string;
  note?: string;
  paramKey?: string;
  depth?: number;
};

export type TraceStepMatchMethod = "stepId" | "stepRunnerSequence" | "stepRunnerKey";

export type ActionTraceDataJsonLocation = {
  dataJsonPath: string;
  nodePath: string;
  stepPath: string;
  dataJsonPointer: string;
  paramName?: string;
  startLine?: number;
  endLine?: number;
  stepRunnerKey?: string;
  stepId?: string;
  matchMethod: TraceStepMatchMethod;
  locationSummary: string;
  read: {
    tool: "workspace_program";
    action: "read_data";
    mode: "content";
    startLine?: number;
    endLine?: number;
  };
};

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Preorder walk of data.json steps[] — same nodePath rules as patch/diagnostics. */
export function walkDataJsonSteps(
  stepsRaw: unknown,
  pathPrefix = "",
): ProgramStepWalkEntry[] {
  if (!Array.isArray(stepsRaw)) return [];

  const entries: ProgramStepWalkEntry[] = [];
  for (let index = 0; index < stepsRaw.length; index += 1) {
    const row = readRecord(stepsRaw[index]);
    if (!row) continue;

    const nodePath = pathPrefix ? `${pathPrefix}/${index}` : String(index);
    entries.push({
      nodePath,
      stepRunnerKey: readString(row.stepRunnerKey) ?? "",
      note: readString(row.note),
      stepId: readString(row.stepId),
    });

    const ifSteps = row.ifSteps;
    if (Array.isArray(ifSteps) && ifSteps.length > 0) {
      entries.push(...walkDataJsonSteps(ifSteps, `${nodePath}/if`));
    }
    const elseSteps = row.elseSteps;
    if (Array.isArray(elseSteps) && elseSteps.length > 0) {
      entries.push(...walkDataJsonSteps(elseSteps, `${nodePath}/else`));
    }
  }
  return entries;
}

function normalizeTraceStepIdCandidates(stepId: string): string[] {
  const trimmed = stepId.trim();
  const candidates = [trimmed];
  const parts = trimmed.split("-");
  while (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1] ?? "")) {
    parts.pop();
    candidates.push(parts.join("-"));
  }
  return [...new Set(candidates.filter((item) => item.length > 0))];
}

function findNodePathByStepId(
  treeSteps: ProgramStepWalkEntry[],
  stepId: string,
): string | null {
  for (const candidate of normalizeTraceStepIdCandidates(stepId)) {
    const hit = treeSteps.find((step) => step.stepId === candidate);
    if (hit) return hit.nodePath;
  }
  return null;
}

type TraceStepBegin = {
  stepId: string;
  stepRunnerKey: string;
  note?: string;
  stepRunnerName?: string;
};

/** Unique step_begin rows in trace order (loop iterations collapse to one row). */
export function collectUniqueTraceStepBegins(
  events: ActionTraceEvent[],
): TraceStepBegin[] {
  const seen = new Set<string>();
  const rows: TraceStepBegin[] = [];

  for (const event of events) {
    if (event.kind !== "step_begin") continue;
    const stepRunnerKey =
      readString(event.stepRunnerKey) ?? readString(event.stepRunnerName) ?? "";
    const stepId =
      readString(event.stepId)
      ?? `${stepRunnerKey}#${rows.length}`;
    if (seen.has(stepId)) continue;
    seen.add(stepId);
    rows.push({
      stepId,
      stepRunnerKey,
      note: readString(event.note),
      stepRunnerName: readString(event.stepRunnerName),
    });
  }
  return rows;
}

/** Map trace stepId → nodePath by matching stepRunnerKey preorder sequence. */
export function buildTraceStepIdToNodePathMap(
  events: ActionTraceEvent[],
  treeSteps: ProgramStepWalkEntry[],
): Map<string, string> {
  const map = new Map<string, string>();
  const traceSteps = collectUniqueTraceStepBegins(events);

  for (const traceStep of traceSteps) {
    const byId = findNodePathByStepId(treeSteps, traceStep.stepId);
    if (byId) {
      map.set(traceStep.stepId, byId);
    }
  }

  let treeIndex = 0;
  for (const traceStep of traceSteps) {
    if (map.has(traceStep.stepId)) continue;
    while (
      treeIndex < treeSteps.length
      && treeSteps[treeIndex]!.stepRunnerKey !== traceStep.stepRunnerKey
    ) {
      treeIndex += 1;
    }
    if (treeIndex >= treeSteps.length) break;
    map.set(traceStep.stepId, treeSteps[treeIndex]!.nodePath);
    treeIndex += 1;
  }

  return map;
}

function findLastStepBeginBefore(
  events: ActionTraceEvent[],
  endIndex: number,
): ActionTraceEvent | null {
  for (let i = endIndex; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.kind === "step_begin") return event;
  }
  return null;
}

function findNearestParamKey(
  events: ActionTraceEvent[],
  endIndex: number,
): string | undefined {
  for (let i = endIndex; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.kind === "step_begin" || event.kind === "step_end") break;
    const paramKey = readString(event.paramKey);
    if (paramKey) return paramKey;
  }
  return undefined;
}

/** Extract the failing step context from a completed trace. */
export function extractTraceFailureContext(
  events: ActionTraceEvent[],
  runMeta?: {
    ok?: boolean;
    errorMessage?: string;
    message?: string;
  },
): ActionTraceFailureContext | null {
  if (events.length === 0) {
    const message =
      readString(runMeta?.errorMessage) ?? readString(runMeta?.message);
    if (!message) return null;
    return { message, kind: "run_failed" };
  }

  let errorIndex = -1;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]!.kind === "error") {
      errorIndex = i;
      break;
    }
  }

  if (errorIndex >= 0) {
    const errorEvent = events[errorIndex]!;
    const stepBegin = findLastStepBeginBefore(events, errorIndex);
    return {
      message: readString(errorEvent.message) ?? "trace error",
      kind: "error",
      stepId: readString(stepBegin?.stepId) ?? readString(errorEvent.stepId),
      stepPath: readString(errorEvent.stepPath) ?? readString(stepBegin?.stepPath),
      stepRunnerKey:
        readString(stepBegin?.stepRunnerKey)
        ?? readString(errorEvent.stepRunnerKey),
      stepRunnerName: readString(stepBegin?.stepRunnerName),
      note: readString(stepBegin?.note),
      paramKey: findNearestParamKey(events, errorIndex),
      depth: stepBegin?.depth ?? errorEvent.depth,
    };
  }

  if (runMeta?.ok === false) {
    const warningIndex = events.findLastIndex((event) => event.kind === "warning");
    const anchorIndex = warningIndex >= 0 ? warningIndex : events.length - 1;
    const stepBegin = findLastStepBeginBefore(events, anchorIndex);
    const message =
      readString(runMeta.errorMessage)
      ?? readString(runMeta.message)
      ?? readString(events[warningIndex]?.message)
      ?? "action run failed";
    return {
      message,
      kind: warningIndex >= 0 ? "warning" : "run_failed",
      stepId: readString(stepBegin?.stepId),
      stepRunnerKey: readString(stepBegin?.stepRunnerKey),
      stepRunnerName: readString(stepBegin?.stepRunnerName),
      note: readString(stepBegin?.note),
      paramKey: findNearestParamKey(events, anchorIndex),
      depth: stepBegin?.depth,
    };
  }

  return null;
}

export function buildDataJsonPointer(
  nodePath: string,
  paramKey?: string,
): string {
  if (paramKey?.trim()) {
    return `steps[${nodePath}].inputParams.${paramKey.trim()}`;
  }
  return `steps[${nodePath}]`;
}

export type QkrpcFailureLocationInput = {
  stepPath: string;
  stepId?: string;
  stepRunnerKey?: string;
  paramKey?: string;
  dataJsonPointer?: string;
  matchMethod?: string;
};

/** Merge authoritative qkrpc failureLocation with workspace data.json line ranges (pure — no I/O). */
export function buildLocationFromQkrpcFailure(input: {
  qkrpcLocation: QkrpcFailureLocationInput;
  dataJsonText: string;
  dataJsonPath: string;
}): ActionTraceDataJsonLocation | null {
  const nodePath = input.qkrpcLocation.stepPath.trim();
  if (!nodePath) return null;

  const paramName = readString(input.qkrpcLocation.paramKey);
  const dataJsonPointer =
    readString(input.qkrpcLocation.dataJsonPointer)
    ?? buildDataJsonPointer(nodePath, paramName);
  const slice = computeProgramStepDiskSlice(input.dataJsonText, nodePath);
  const matchMethodRaw = readString(input.qkrpcLocation.matchMethod);

  const location: ActionTraceDataJsonLocation = {
    dataJsonPath: input.dataJsonPath.replace(/\\/g, "/"),
    nodePath,
    stepPath: nodePath,
    dataJsonPointer,
    paramName,
    stepRunnerKey: readString(input.qkrpcLocation.stepRunnerKey),
    stepId: readString(input.qkrpcLocation.stepId),
    matchMethod:
      matchMethodRaw === "stepId"
      || matchMethodRaw === "stepRunnerSequence"
      || matchMethodRaw === "stepRunnerKey"
        ? matchMethodRaw
        : "stepId",
    locationSummary: "",
    read: {
      tool: "workspace_program",
      action: "read_data",
      mode: "content",
    },
  };

  if (slice.ok) {
    location.startLine = slice.slice.startLine;
    location.endLine = slice.slice.endLine;
    location.read.startLine = slice.slice.startLine;
    location.read.endLine = slice.slice.endLine;
  }

  location.locationSummary = formatTraceLocationSummary({
    nodePath: location.nodePath,
    dataJsonPointer: location.dataJsonPointer,
    stepRunnerKey: location.stepRunnerKey,
    stepId: location.stepId,
    paramName: location.paramName,
    startLine: location.startLine,
    endLine: location.endLine,
    dataJsonPath: location.dataJsonPath,
  });

  return location;
}

function resolveNodePathForFailure(
  failure: ActionTraceFailureContext,
  events: ActionTraceEvent[],
  treeSteps: ProgramStepWalkEntry[],
): { nodePath: string; matchMethod: TraceStepMatchMethod; stepId?: string } | null {
  if (failure.stepPath?.trim()) {
    return {
      nodePath: failure.stepPath.trim(),
      matchMethod: "stepId",
      stepId: failure.stepId,
    };
  }

  if (failure.stepId) {
    const byId = findNodePathByStepId(treeSteps, failure.stepId);
    if (byId) {
      return { nodePath: byId, matchMethod: "stepId", stepId: failure.stepId };
    }
    const map = buildTraceStepIdToNodePathMap(events, treeSteps);
    const mapped = map.get(failure.stepId);
    if (mapped) {
      return { nodePath: mapped, matchMethod: "stepRunnerSequence", stepId: failure.stepId };
    }
  }

  const runnerKey = failure.stepRunnerKey?.trim();
  if (runnerKey) {
    const matches = treeSteps.filter((step) => step.stepRunnerKey === runnerKey);
    if (matches.length === 1) {
      return {
        nodePath: matches[0]!.nodePath,
        matchMethod: "stepRunnerKey",
        stepId: matches[0]!.stepId,
      };
    }
    if (matches.length > 1 && failure.note) {
      const noted = matches.find((step) => step.note === failure.note);
      if (noted) {
        return {
          nodePath: noted.nodePath,
          matchMethod: "stepRunnerKey",
          stepId: noted.stepId,
        };
      }
    }
  }

  return null;
}

export function formatTraceLocationSummary(input: {
  nodePath: string;
  dataJsonPointer: string;
  stepRunnerKey?: string;
  stepId?: string;
  paramName?: string;
  startLine?: number;
  endLine?: number;
  dataJsonPath: string;
}): string {
  const parts: string[] = [];
  if (input.stepId) {
    parts.push(`step ${input.stepId} path ${input.nodePath}`);
  } else {
    parts.push(`steps[${input.nodePath}]`);
  }
  if (input.stepRunnerKey) parts.push(input.stepRunnerKey);
  if (input.paramName) parts.push(`param ${input.paramName}`);
  if (input.startLine != null) {
    const linePart =
      input.endLine != null && input.endLine !== input.startLine
        ? `L${input.startLine}-${input.endLine}`
        : `L${input.startLine}`;
    parts.push(`${input.dataJsonPath} ${linePart}`);
  } else {
    parts.push(`${input.dataJsonPath} ${input.dataJsonPointer}`);
  }
  return parts.join(" · ");
}

/** Resolve debug trace failure to a workspace data.json location (pure — no I/O). */
export function resolveTraceLocationInDataJson(input: {
  events: ActionTraceEvent[] | unknown;
  dataJsonText: string;
  dataJsonPath: string;
  runMeta?: {
    ok?: boolean;
    errorMessage?: string;
    message?: string;
  };
}): ActionTraceDataJsonLocation | null {
  const events = Array.isArray(input.events)
    ? (input.events as ActionTraceEvent[])
    : parseActionTraceEvents(input.events);

  const failure = extractTraceFailureContext(events, input.runMeta);
  if (!failure) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(input.dataJsonText) as Record<string, unknown>;
  } catch {
    return null;
  }

  const treeSteps = walkDataJsonSteps(parsed.steps);
  if (treeSteps.length === 0) return null;

  const resolved = resolveNodePathForFailure(failure, events, treeSteps);
  if (!resolved) return null;

  const treeStep = treeSteps.find((step) => step.nodePath === resolved.nodePath);
  const paramName = failure.paramKey?.trim() || undefined;
  const dataJsonPointer = buildDataJsonPointer(resolved.nodePath, paramName);
  const slice = computeProgramStepDiskSlice(input.dataJsonText, resolved.nodePath);

  const location: ActionTraceDataJsonLocation = {
    dataJsonPath: input.dataJsonPath.replace(/\\/g, "/"),
    nodePath: resolved.nodePath,
    stepPath: resolved.nodePath,
    dataJsonPointer,
    paramName,
    stepRunnerKey: treeStep?.stepRunnerKey ?? failure.stepRunnerKey,
    stepId: resolved.stepId ?? treeStep?.stepId ?? failure.stepId,
    matchMethod: resolved.matchMethod,
    locationSummary: "",
    read: {
      tool: "workspace_program",
      action: "read_data",
      mode: "content",
    },
  };

  if (slice.ok) {
    location.startLine = slice.slice.startLine;
    location.endLine = slice.slice.endLine;
    location.read.startLine = slice.slice.startLine;
    location.read.endLine = slice.slice.endLine;
  }

  location.locationSummary = formatTraceLocationSummary({
    nodePath: location.nodePath,
    dataJsonPointer: location.dataJsonPointer,
    stepRunnerKey: location.stepRunnerKey,
    stepId: location.stepId,
    paramName: location.paramName,
    startLine: location.startLine,
    endLine: location.endLine,
    dataJsonPath: location.dataJsonPath,
  });

  return location;
}
