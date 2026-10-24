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
import { readTraceRunOwner } from "./action-trace-owner";
import { qkrpcRequestContext, runWithQkrpcCwdAsync } from "./qkrpc-request-context";
import { traceTerminalSummary } from "./action-trace-bridge.server";

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
  const request = qkrpcRequestContext.getStore();
  request?.abortSignal?.throwIfAborted();
  if (request?.executionState?.closed) return formatted;

  const events = parseActionTraceEvents(data.events ?? data);
  const owner = readTraceRunOwner(data.traceOwner);
  if (events.length === 0) return formatted;

  const actionId = options.actionId.trim();
  const traceId = owner?.runId ?? randomUUID();
  const relativePath = buildActionTraceArtifactPath(actionId, traceId);
  const artifact = buildActionTraceArtifactDocument(data, {
    actionId,
    param: options.param,
    events,
  });

  const write = () => {
    request?.abortSignal?.throwIfAborted();
    return writeWorkspaceFile(
    relativePath,
    JSON.stringify(artifact, null, 2),
    );
  };
  const writeResult = owner ? await runWithQkrpcCwdAsync(owner.cwd, write) : await write();

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
    ...(owner ? { owner } : {}),
    path: writeResult.path,
    format: ACTION_TRACE_ARTIFACT_FORMAT,
  };
  const stepSummaries = buildActionTraceStepSummaries(events);
  qkrpcRequestContext.getStore()?.traceRefs?.push(traceRef);
  if (owner) {
    qkrpcRequestContext.getStore()?.traceExecution?.emit({ kind: "result", owner, data: { ...traceTerminalSummary(data), traceOwner: owner, traceRef, stepSummaries } });
  }

  return {
    ...formatted,
    data: {
      ...data,
      traceRef,
      stepSummaries,
    },
  };
}
