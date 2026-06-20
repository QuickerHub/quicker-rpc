import { fetchWorkspaceFile } from "@/lib/workspace-explorer-api";
import {
  parseActionTraceArtifactDocument,
  readActionTraceRef,
  type ActionTraceRef,
} from "@/lib/action-trace-artifact";
import { hydrateActionTraceFromToolOutput } from "@/lib/action-trace-overlay";

export async function hydrateActionTraceFromArtifact(
  cwd: string,
  traceRef: ActionTraceRef,
  options?: { actionId?: string; param?: string; actionTitle?: string },
): Promise<boolean> {
  const file = await fetchWorkspaceFile(cwd, traceRef.path);
  if (!file.ok || typeof file.content !== "string") return false;

  const artifact = parseActionTraceArtifactDocument(file.content);
  if (!artifact) return false;

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
