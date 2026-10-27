import type { QkrpcHostBinding } from "./qkrpc-host-binding-contract";
import { readHostBinding } from "./qkrpc-host-binding-contract";
import type { SourceBundleDocument } from "./source-bundle-document";
import { readSourceVariableIdentity, type SourceVariableIdentity } from "./source-variable-identity";

/** Actual source storage identity; deliberately independent of legacy project binding. */
export type LiveProgramSourceTarget = Readonly<{
  actionId: string; hostBinding: QkrpcHostBinding | null; storageIdentity: unknown;
  ownerToken: string; sourceSnapshot: SourceBundleDocument["sourceSnapshot"];
  variableIdentity: SourceVariableIdentity;
  /** Private client adoption epoch; even a no-op local Save retires old mapping proofs. */
  mappingEpoch: number;
}>;
export function isLiveProgramSourceTarget(value: unknown): value is LiveProgramSourceTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>, snapshot = row.sourceSnapshot as Record<string, unknown> | undefined;
  const identity = readSourceVariableIdentity(row.variableIdentity);
  return typeof row.actionId === "string" && Boolean(row.actionId.trim()) && typeof row.ownerToken === "string" && Boolean(row.ownerToken)
    && Number.isSafeInteger(row.mappingEpoch) && Number(row.mappingEpoch) > 0
    && Object.hasOwn(row, "storageIdentity") && (row.hostBinding === null || readHostBinding(row.hostBinding) !== undefined)
    && Boolean(snapshot && typeof snapshot.revision === "string" && typeof snapshot.managedRevision === "string" && typeof snapshot.codecRevision === "string"
      && Array.isArray(snapshot.files) && identity?.view === "observed" && identity.baselineEditorHash === identity.editorDocumentHash
      && identity.sourceSnapshot === snapshot.revision && identity.codecRevision === snapshot.codecRevision);
}
