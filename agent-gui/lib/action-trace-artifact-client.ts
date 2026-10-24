import { fetchWorkspaceFile } from "@/lib/workspace-explorer-api";
import {
  parseActionTraceArtifactDocument,
  readActionTraceRef,
  type ActionTraceRef,
} from "@/lib/action-trace-artifact";
import { hydrateActionTraceFromToolOutput } from "@/lib/action-trace-overlay";
import type { TraceViewLease } from "./action-trace-overlay";
import { sameTraceRunOwner } from "./action-trace-owner";

export async function hydrateActionTraceFromArtifact(
  cwd: string,
  traceRef: ActionTraceRef,
  options?: { actionId?: string; param?: string; actionTitle?: string; view?: TraceViewLease; signal?: AbortSignal },
): Promise<boolean> {
  const file = await fetchWorkspaceFile(cwd, traceRef.path);
  if (options?.signal?.aborted || options?.view && !options.view.isCurrent()) return false;
  if (!file.ok || typeof file.content !== "string") return false;

  const artifact = parseActionTraceArtifactDocument(file.content);
  if (!artifact) return false;
  if (options?.view) {
    const { view } = options;
    if (view.cwd !== cwd || view.owner && (!traceRef.owner || !artifact.traceOwner
      || !sameTraceRunOwner(view.owner, traceRef.owner) || !sameTraceRunOwner(view.owner, artifact.traceOwner))) return false;
    if (!view.owner && (traceRef.owner || artifact.traceOwner)) return false;
    view.hydrate(artifact as unknown as Record<string, unknown>);
    return true;
  }
  if (artifact.traceOwner || traceRef.owner) return false;

  hydrateActionTraceFromToolOutput(
    {
      actionId: artifact.actionId,
      ok: artifact.ok,
      eventCount: artifact.eventCount,
      durationMs: artifact.durationMs,
      events: artifact.events,
      message: artifact.message,
      errorMessage: artifact.errorMessage,
      returnResult: artifact.returnResult,
      failureLocation: artifact.failureLocation,
      traceRef,
    },
    {
      actionId: options?.actionId ?? artifact.actionId,
      param: options?.param ?? artifact.param,
      actionTitle: options?.actionTitle,
    },
  );
  return true;
}

export function readTraceRefFromToolData(
  data: Record<string, unknown>,
): ActionTraceRef | null {
  return readActionTraceRef(data.traceRef);
}
