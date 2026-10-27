import type { SourceBundleDocument } from "./source-bundle-document";
import { readProgramDocumentLiveStep } from "./action-editor/document/programDocumentStepLive";

export type SourceStepOrigin = Readonly<{
  surface: string; editorId: string; runnerKey: string;
  provenance: "source" | "native-checkpoint" | "generated" | "unknown";
  sourceId: string | null; sourceIdProven: boolean;
  nativeCheckpointId: string | null; nativeCheckpointIdProven: boolean;
  nativeIdentity: "checkpoint-proven" | "unknown";
  ownedSurface: boolean; hasSyntheticAncestor: boolean; stableIdentityProven: boolean;
  identityDenialReason: string | null; documentLocalIdentityProven: boolean;
  documentLocalIdentityDenialReason: string | null;
  sourceRowAnchor: Readonly<{ surface: string; path: string; rowHash: string }> | null;
  ancestors: readonly unknown[];
}>;
export type SourceStepIdentity = Readonly<{
  schemaVersion: 1; sourceSnapshot: string; codecRevision: string; editorDocumentHash: string;
  baselineEditorHash: string; mappingEpochKind: "content-bound"; mappingEpoch: string;
  view: "observed" | "candidate"; identityMappingScope: "source-codec-identity-only";
  authorizesLive: false; steps: readonly SourceStepOrigin[];
}>;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const hash = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
const id = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim()) && value === value.trim();
const nullableId = (value: unknown): value is string | null => value === null || id(value);
const ancestorProven = (row: Record<string, unknown>): boolean => row.sourceIdProven === true && id(row.sourceId) && row.sourceId === row.editorId;

/** Optional codec facts, never a permission derived from names, prefixes or a host version. */
export function readSourceStepIdentity(value: unknown): SourceStepIdentity | undefined {
  if (!object(value) || value.schemaVersion !== 1 || value.authorizesLive !== false || !hash(value.sourceSnapshot)
    || !hash(value.codecRevision) || !hash(value.editorDocumentHash) || !hash(value.baselineEditorHash)
    || value.mappingEpochKind !== "content-bound" || !hash(value.mappingEpoch) || value.identityMappingScope !== "source-codec-identity-only"
    || !["observed", "candidate"].includes(String(value.view)) || !Array.isArray(value.steps)) return;
  const keys = new Set<string>();
  for (const row of value.steps) {
    if (!object(row) || !id(row.editorId) || !id(row.runnerKey) || typeof row.surface !== "string"
      || !(row.surface === "main" || /^sub-.+/.test(row.surface))
      || !["source", "native-checkpoint", "generated", "unknown"].includes(String(row.provenance))
      || !nullableId(row.sourceId) || !nullableId(row.nativeCheckpointId)
      || !["unknown", "checkpoint-proven"].includes(String(row.nativeIdentity))
      || ["sourceIdProven", "nativeCheckpointIdProven", "ownedSurface", "hasSyntheticAncestor", "stableIdentityProven", "documentLocalIdentityProven"].some(key => typeof row[key] !== "boolean")
      || ["identityDenialReason", "documentLocalIdentityDenialReason"].some(key => row[key] !== null && typeof row[key] !== "string")
      || !Array.isArray(row.ancestors)) return;
    if (row.sourceIdProven && (row.sourceId === null || row.sourceId !== row.editorId)
      || row.nativeCheckpointIdProven && (row.nativeCheckpointId !== row.editorId || !row.sourceIdProven || row.nativeIdentity !== "checkpoint-proven")
      || row.nativeIdentity === "checkpoint-proven" && !row.nativeCheckpointIdProven) return;
    if (row.sourceRowAnchor !== null && (!object(row.sourceRowAnchor) || row.sourceRowAnchor.surface !== row.surface
      || typeof row.sourceRowAnchor.path !== "string" || !/^\/steps\/\d+(?:\/(?:ifSteps|elseSteps)\/\d+)*$/.test(row.sourceRowAnchor.path)
      || !hash(row.sourceRowAnchor.rowHash))) return;
    if (row.ancestors.some(ancestor => !object(ancestor) || !id(ancestor.editorId) || typeof ancestor.surface !== "string"
      || !nullableId(ancestor.sourceId) || ["sourceIdProven", "synthetic", "owned"].some(key => typeof ancestor[key] !== "boolean")
      || ancestor.sourceIdProven === true && !ancestorProven(ancestor))) return;
    const key = JSON.stringify([row.surface, row.editorId]);
    if (keys.has(key)) return; keys.add(key);
  }
  return structuredClone(value) as SourceStepIdentity;
}

export function sourceStepOrigin(identity: SourceStepIdentity | undefined, surface: string, stepId: string): SourceStepOrigin | undefined {
  if (!identity || identity.view !== "observed") return;
  const rows = identity.steps.filter(row => row.surface === surface && row.editorId === stepId);
  if (rows.length !== 1) return;
  const row = rows[0]!;
  if (!row.documentLocalIdentityProven || row.documentLocalIdentityDenialReason !== null || !row.sourceRowAnchor
    || !row.ownedSurface || row.hasSyntheticAncestor
    || row.ancestors.some(ancestor => !object(ancestor) || ancestor.synthetic !== false || ancestor.owned !== true || !ancestorProven(ancestor))) return;
  return row;
}

export async function verifySourceStepIdentity(document: SourceBundleDocument): Promise<SourceStepIdentity | undefined> {
  const identity = readSourceStepIdentity(document.stepIdentity);
  if (!identity || document.mode === "preview" || identity.view !== "observed" || identity.sourceSnapshot !== document.sourceSnapshot.revision
    || identity.codecRevision !== document.sourceSnapshot.codecRevision || !object(document.codec) || document.codec.descriptorRevision !== identity.codecRevision
    || !globalThis.crypto?.subtle) return;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(document.editorJson));
  const actual = `sha256:${Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("")}`;
  if (actual !== identity.editorDocumentHash.toLowerCase() || actual !== identity.baselineEditorHash.toLowerCase()) return;
  const anchors = new Set<string>();
  for (const row of identity.steps) if (row.documentLocalIdentityProven) {
    if (!sourceStepOrigin(identity, row.surface, row.editorId)) return;
    let observed;
    try { observed = readProgramDocumentLiveStep(document.editorJson, row.editorId); } catch { return; }
    if (observed.surface !== row.surface || observed.path !== row.sourceRowAnchor!.path || observed.runnerKey !== row.runnerKey) return;
    const anchor = JSON.stringify([row.surface, row.sourceRowAnchor!.path]);
    if (anchors.has(anchor)) return; anchors.add(anchor);
  }
  return identity;
}
