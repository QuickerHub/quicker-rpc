import { fetchWorkspaceFile } from "@/lib/workspace-explorer-api";
import {
  parseActionTraceArtifactDocument,
  readActionTraceRef,
  type ActionTraceRef,
} from "@/lib/action-trace-artifact";
import type { TraceViewLease } from "./action-trace-overlay";
import { sameTraceRunOwner } from "./action-trace-owner";

export async function hydrateActionTraceFromArtifact(
  cwd: string,
  traceRef: ActionTraceRef,
  options: { view: TraceViewLease; signal?: AbortSignal },
): Promise<boolean> {
  const view = options?.view;
  if (!view || !view.isCurrent() || view.cwd !== cwd || options.signal?.aborted) return false;
  const file = await fetchWorkspaceFile(cwd, traceRef.path);
  if (options.signal?.aborted || !view.isCurrent()) return false;
  if (!file.ok || typeof file.content !== "string") return false;

  const artifact = parseActionTraceArtifactDocument(file.content);
  if (!artifact) return false;
  if (view.owner && (!traceRef.owner || !artifact.traceOwner
    || !sameTraceRunOwner(view.owner, traceRef.owner) || !sameTraceRunOwner(view.owner, artifact.traceOwner))) return false;
  if (!view.owner && (traceRef.owner || artifact.traceOwner)) return false;
  view.hydrate(artifact as unknown as Record<string, unknown>);
  return true;
}

export function readTraceRefFromToolData(
  data: Record<string, unknown>,
): ActionTraceRef | null {
  return readActionTraceRef(data.traceRef);
}
