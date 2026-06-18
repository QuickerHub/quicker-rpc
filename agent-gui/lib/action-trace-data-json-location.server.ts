import "server-only";

import {
  buildLocationFromQkrpcFailure,
  resolveTraceLocationInDataJson,
  type ActionTraceDataJsonLocation,
  type QkrpcFailureLocationInput,
} from "@/lib/action-trace-data-json-location";
import { parseActionTraceEvents } from "@/lib/action-trace-format";
import { resolveActionDataJsonPath } from "@/lib/action-project-data-file.server";
import { readWorkspaceFile } from "@/lib/workspace-fs";

type QkrpcFailureLocation = QkrpcFailureLocationInput & {
  message?: string;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readQkrpcFailureLocation(data: Record<string, unknown>): QkrpcFailureLocation | null {
  const raw = readRecord(data.failureLocation);
  if (!raw || raw.unavailable === true) return null;
  const stepPath = readString(raw.stepPath);
  if (!stepPath) return null;
  return {
    stepId: readString(raw.stepId),
    stepPath,
    stepRunnerKey: readString(raw.stepRunnerKey),
    paramKey: readString(raw.paramKey),
    dataJsonPointer: readString(raw.dataJsonPointer),
    message: readString(raw.message),
    matchMethod: readString(raw.matchMethod),
  };
}

async function enrichFromQkrpcFailureLocation(
  actionId: string,
  payload: Record<string, unknown>,
  qkrpcLocation: QkrpcFailureLocation,
): Promise<ActionTraceDataJsonLocation | null> {
  const resolved = await resolveActionDataJsonPath(actionId);
  if (!resolved.ok) return null;

  const file = await readWorkspaceFile(resolved.resolved.path);
  if (!file.ok) return null;

  return buildLocationFromQkrpcFailure({
    qkrpcLocation,
    dataJsonText: file.content,
    dataJsonPath: resolved.resolved.path,
  });
}

export async function enrichDebugResultWithDataJsonLocation(
  actionId: string,
  formatted: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const data = formatted.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return formatted;
  }

  const payload = data as Record<string, unknown>;
  const qkrpcLocation = readQkrpcFailureLocation(payload);
  if (qkrpcLocation) {
    const enriched = await enrichFromQkrpcFailureLocation(actionId, payload, qkrpcLocation);
    if (enriched) {
      return attachFailureLocation(formatted, payload, enriched);
    }
  }

  const events = parseActionTraceEvents(payload.events ?? payload);
  if (events.length === 0 && payload.ok !== false && formatted.ok !== false) {
    return formatted;
  }

  const resolved = await resolveActionDataJsonPath(actionId);
  if (!resolved.ok) {
    return {
      ...formatted,
      data: {
        ...payload,
        failureLocation: payload.failureLocation ?? {
          unavailable: true,
          reason: resolved.error,
        },
      },
    };
  }

  const file = await readWorkspaceFile(resolved.resolved.path);
  if (!file.ok) {
    return {
      ...formatted,
      data: {
        ...payload,
        failureLocation: payload.failureLocation ?? {
          unavailable: true,
          reason: file.error,
        },
      },
    };
  }

  const location = resolveTraceLocationInDataJson({
    events,
    dataJsonText: file.content,
    dataJsonPath: resolved.resolved.path,
    runMeta: {
      ok: payload.ok === true || formatted.ok === true,
      errorMessage:
        typeof payload.errorMessage === "string" ? payload.errorMessage : undefined,
      message: typeof payload.message === "string" ? payload.message : undefined,
    },
  });

  if (!location) {
    const failureMessage =
      typeof payload.errorMessage === "string"
        ? payload.errorMessage
        : typeof payload.message === "string"
          ? payload.message
          : undefined;
    if (!failureMessage && formatted.ok !== false && payload.ok !== false) {
      return formatted;
    }
    if (payload.failureLocation) {
      return formatted;
    }
    return {
      ...formatted,
      data: {
        ...payload,
        failureLocation: {
          unavailable: true,
          reason: "Could not map trace failure to a step in data.json",
        },
      },
    };
  }

  return attachFailureLocation(formatted, payload, location);
}

function attachFailureLocation(
  formatted: Record<string, unknown>,
  payload: Record<string, unknown>,
  location: ActionTraceDataJsonLocation,
): Record<string, unknown> {
  return {
    ...formatted,
    data: {
      ...payload,
      failureLocation: location,
      editHint:
        `Fix ${location.dataJsonPath} at ${location.dataJsonPointer}`
        + (location.startLine != null ? ` (L${location.startLine})` : "")
        + " via workspace_program read_data/edit_data → patch.",
    },
  };
}
