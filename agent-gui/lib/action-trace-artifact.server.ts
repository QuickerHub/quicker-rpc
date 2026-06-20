import "server-only";

import { randomUUID } from "node:crypto";
import {
  buildActionTraceArtifactDocument,
  buildActionTraceArtifactPath,
  buildActionTraceStepSummaries,
  type ActionTraceRef,
  ACTION_TRACE_ARTIFACT_FORMAT,
} from "@/lib/action-trace-artifact";
import { parseActionTraceEvents } from "@/lib/action-trace-format";
import { writeWorkspaceFile } from "@/lib/workspace-fs";

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Write full trace to workspace scratch and attach traceRef + stepSummaries on data. */
export async function attachActionTraceArtifactToDebugResult(
  formatted: Record<string, unknown>,
  options: { actionId: string; param?: string },
): Promise<Record<string, unknown>> {
  const data = readRecord(formatted.data);
  if (!data) return formatted;

  const events = parseActionTraceEvents(data.events ?? data);
  if (events.length === 0) return formatted;

  const actionId = options.actionId.trim();
  const traceId = randomUUID();
  const relativePath = buildActionTraceArtifactPath(actionId, traceId);
  const artifact = buildActionTraceArtifactDocument(data, {
    actionId,
    param: options.param,
    events,
  });

  const writeResult = await writeWorkspaceFile(
    relativePath,
    JSON.stringify(artifact, null, 2),
  );

  if (!writeResult.ok) {
    return {
      ...formatted,
      data: {
        ...data,
        traceRefWriteError: writeResult.error,
      },
    };
  }

  const traceRef: ActionTraceRef = {
    path: writeResult.path,
    format: ACTION_TRACE_ARTIFACT_FORMAT,
  };
  const stepSummaries = buildActionTraceStepSummaries(events);

  return {
    ...formatted,
    data: {
      ...data,
      traceRef,
      stepSummaries,
    },
  };
}
