import type { QkrpcHostBinding } from "./qkrpc-host-binding-contract";
import { readHostBinding } from "./qkrpc-host-binding-contract";
import type { SourceBundleDocument } from "./source-bundle-document";
import { readSourceVariableIdentity, type SourceVariableIdentity } from "./source-variable-identity";
import { readSourceStepIdentity, type SourceStepIdentity } from "./source-step-identity";

/** Actual source storage identity; deliberately independent of legacy project binding. */
export type LiveProgramSourceTarget = Readonly<{
  actionId: string; hostBinding: QkrpcHostBinding | null; storageIdentity: unknown;
  ownerToken: string; sourceSnapshot: SourceBundleDocument["sourceSnapshot"];
  codec: SourceBundleDocument["codec"];
  variableIdentity: SourceVariableIdentity;
  stepIdentity?: SourceStepIdentity;
  /** Private client adoption epoch; even a no-op local Save retires old mapping proofs. */
  mappingEpoch: number;
}>;
export function isLiveProgramSourceTarget(value: unknown): value is LiveProgramSourceTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>, snapshot = row.sourceSnapshot as Record<string, unknown> | undefined;
  const codec = row.codec && typeof row.codec === "object" && !Array.isArray(row.codec) ? row.codec as Record<string, unknown> : undefined;
  const identity = readSourceVariableIdentity(row.variableIdentity);
  const steps = row.stepIdentity === undefined ? undefined : readSourceStepIdentity(row.stepIdentity);
  return typeof row.actionId === "string" && Boolean(row.actionId.trim()) && typeof row.ownerToken === "string" && Boolean(row.ownerToken)
    && Number.isSafeInteger(row.mappingEpoch) && Number(row.mappingEpoch) > 0
    && Object.hasOwn(row, "storageIdentity") && (row.hostBinding === null || readHostBinding(row.hostBinding) !== undefined)
    && Boolean(snapshot && typeof snapshot.revision === "string" && typeof snapshot.managedRevision === "string" && typeof snapshot.codecRevision === "string"
      && Array.isArray(snapshot.files) && identity?.view === "observed" && identity.baselineEditorHash === identity.editorDocumentHash
      && identity.sourceSnapshot === snapshot.revision && identity.codecRevision === snapshot.codecRevision && codec?.descriptorRevision === snapshot.codecRevision)
    && (row.stepIdentity === undefined || Boolean(steps && steps.view === "observed" && steps.sourceSnapshot === snapshot?.revision
      && steps.codecRevision === snapshot?.codecRevision && steps.editorDocumentHash === identity?.editorDocumentHash
      && steps.baselineEditorHash === steps.editorDocumentHash));
}
