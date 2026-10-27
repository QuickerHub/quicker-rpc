import type { SourceBundleDocument } from "./source-bundle-document";
import { readProgramDocumentVariable } from "./action-editor/document/programDocumentVariableLive";

export type SourceVariableOrigin = Readonly<{
  surface: string; editorId: string;
  provenance: "source" | "native-checkpoint" | "generated" | "unknown";
  sourceId: string | null; sourceIdProven: boolean;
  nativeCheckpointId: string | null; nativeCheckpointIdProven: boolean;
  ownedSurface: boolean; hasSyntheticAncestor: boolean; stableIdentityProven: boolean;
  ancestors: readonly unknown[];
  nativeIdentity: "checkpoint-proven" | "unknown";
  documentLocalIdentityProven: boolean;
  sourceRowAnchor: Readonly<{ surface: string; key: string; rowHash: string }> | null;
  renameMappingProven: boolean;
  renameMappingDenialReason: string | null;
  renameMappingBasis: "native-id" | "checkpoint-source-id-and-native-key" | "unproven";
  identityDenialReason: string | null;
  documentLocalIdentityDenialReason: string | null;
}>;
export type SourceVariableIdentity = Readonly<{
  schemaVersion: 1; sourceSnapshot: string; codecRevision: string; editorDocumentHash: string;
  baselineEditorHash: string; mappingEpochKind: "content-bound"; mappingEpoch: string; view: "observed" | "candidate";
  renameMappingScope: "source-codec-identity-only";
  authorizesLive: false; variables: readonly SourceVariableOrigin[];
}>;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const hash = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
const nullableId = (value: unknown): value is string | null => value === null || typeof value === "string" && Boolean(value.trim());

/** Provenance is received from the actual codec; it is never itself a live grant. */
export function readSourceVariableIdentity(value: unknown): SourceVariableIdentity | undefined {
  if (!object(value) || value.schemaVersion !== 1 || value.authorizesLive !== false || !hash(value.sourceSnapshot)
    || !hash(value.codecRevision) || !hash(value.editorDocumentHash) || !hash(value.baselineEditorHash)
    || value.mappingEpochKind !== "content-bound" || !hash(value.mappingEpoch) || value.renameMappingScope !== "source-codec-identity-only"
    || !["observed", "candidate"].includes(String(value.view)) || !Array.isArray(value.variables)) return;
  const keys = new Set<string>();
  for (const row of value.variables) {
    if (!object(row) || typeof row.surface !== "string" || !(row.surface === "main" || /^sub-.+/.test(row.surface))
      || typeof row.editorId !== "string" || !row.editorId.trim()
      || !["source", "native-checkpoint", "generated", "unknown"].includes(String(row.provenance))
      || !nullableId(row.sourceId) || !nullableId(row.nativeCheckpointId)
      || ["sourceIdProven", "nativeCheckpointIdProven", "ownedSurface", "hasSyntheticAncestor", "stableIdentityProven"].some(key => typeof row[key] !== "boolean")
      || !Array.isArray(row.ancestors) || typeof row.renameMappingProven !== "boolean" || typeof row.documentLocalIdentityProven !== "boolean"
      || !["unknown", "checkpoint-proven"].includes(String(row.nativeIdentity))
      || !["native-id", "checkpoint-source-id-and-native-key", "unproven"].includes(String(row.renameMappingBasis))
      || ["identityDenialReason", "documentLocalIdentityDenialReason", "renameMappingDenialReason"].some(key => row[key] !== null && typeof row[key] !== "string")) return;
    if (row.sourceRowAnchor !== null && (!object(row.sourceRowAnchor) || row.sourceRowAnchor.surface !== row.surface
      || typeof row.sourceRowAnchor.key !== "string" || !row.sourceRowAnchor.key.trim() || !hash(row.sourceRowAnchor.rowHash))) return;
    if (row.ancestors.some(ancestor => !object(ancestor) || typeof ancestor.surface !== "string" || typeof ancestor.editorId !== "string"
      || !nullableId(ancestor.sourceId) || ["sourceIdProven", "synthetic", "owned"].some(key => typeof ancestor[key] !== "boolean"))) return;
    const key = JSON.stringify([row.surface, row.editorId]);
    if (keys.has(key)) return; keys.add(key);
  }
  return structuredClone(value) as SourceVariableIdentity;
}

export async function verifySourceVariableIdentity(document: SourceBundleDocument): Promise<SourceVariableIdentity | undefined> {
  const identity = readSourceVariableIdentity(document.variableIdentity);
  if (!identity || document.mode === "preview" || identity.view !== "observed" || identity.sourceSnapshot !== document.sourceSnapshot.revision
    || identity.codecRevision !== document.sourceSnapshot.codecRevision || !object(document.codec) || document.codec.descriptorRevision !== identity.codecRevision) return;
  if (!globalThis.crypto?.subtle) return;
  const bytes = new TextEncoder().encode(document.editorJson);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actual = `sha256:${Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("")}`;
  if (actual !== identity.editorDocumentHash.toLowerCase() || actual !== identity.baselineEditorHash.toLowerCase()) return;
  const anchors = new Set<string>();
  for (const row of identity.variables) if (row.documentLocalIdentityProven) {
    if (!sourceVariableOrigin(identity, row.surface, row.editorId)) return;
    const observed = readProgramDocumentVariable(document.editorJson, { surface: row.surface, variableId: row.editorId });
    if (!observed.ok || JSON.parse(observed.variable.variableJson).key !== row.sourceRowAnchor!.key) return;
    const key = JSON.stringify(row.sourceRowAnchor);
    if (anchors.has(key)) return; anchors.add(key);
  }
  return identity;
}

export function sourceVariableOrigin(identity: SourceVariableIdentity, surface: string, variableId: string): SourceVariableOrigin | undefined {
  const rows = identity.variables.filter(row => row.surface === surface && row.editorId === variableId);
  if (rows.length !== 1) return;
  const row = rows[0];
  if (identity.view !== "observed" || !row.ownedSurface || row.hasSyntheticAncestor || !row.documentLocalIdentityProven || !row.sourceRowAnchor
    || row.ancestors.some(ancestor => !object(ancestor) || ancestor.synthetic !== false || ancestor.owned !== true || ancestor.sourceIdProven !== true)) return;
  return row;
}

/** Distinct actual codec proofs; checkpoint key pairing does not claim a native ID. */
export function sourceVariableRenameProven(row: SourceVariableOrigin): boolean {
  if (!row.renameMappingProven || row.renameMappingDenialReason !== null || !row.stableIdentityProven || row.identityDenialReason !== null
    || !row.documentLocalIdentityProven || row.documentLocalIdentityDenialReason !== null || !row.sourceRowAnchor || !row.ownedSurface || row.hasSyntheticAncestor) return false;
  if (row.renameMappingBasis === "native-id") return row.nativeIdentity === "checkpoint-proven" && row.nativeCheckpointIdProven
    && Boolean(row.nativeCheckpointId) && (row.provenance === "source" || row.provenance === "native-checkpoint")
    && row.editorId === row.nativeCheckpointId && (row.sourceIdProven ? row.sourceId === row.editorId : row.sourceId === null);
  if (row.renameMappingBasis === "checkpoint-source-id-and-native-key") return row.provenance === "source" && row.sourceIdProven && Boolean(row.sourceId)
    && row.editorId === row.sourceId && row.nativeIdentity === "unknown" && !row.nativeCheckpointIdProven && row.nativeCheckpointId === null;
  return false;
}
