/** Explicit codec observations for transport/SDK unit fixtures. Real codec interchange is tested by the Source DOM gate. */
import { createHash } from "node:crypto";
import type { LiveProgramSourceTarget } from "./live-program-source-target";
import type { QkrpcHostBinding } from "./qkrpc-host-binding-contract";
export const sourceStepTestHash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
export function sourceStepTestTarget(content: string, stepId: string, runnerKey: string, hostBinding: QkrpcHostBinding | null = null): LiveProgramSourceTarget {
  const hash = sourceStepTestHash;
  const common = { schemaVersion: 1 as const, authorizesLive: false as const, sourceSnapshot: hash("snapshot"), codecRevision: hash("codec"),
    editorDocumentHash: hash(content), baselineEditorHash: hash(content), mappingEpochKind: "content-bound" as const,
    mappingEpoch: hash("mapping"), view: "observed" as const };
  return { actionId: "11111111-1111-4111-8111-111111111111", hostBinding, storageIdentity: null, ownerToken: "source-owner-token", mappingEpoch: 1,
    sourceSnapshot: { revision: hash("snapshot"), codecRevision: hash("codec"), managedRevision: hash("managed"), files: [] },
    codec: { descriptorRevision: hash("codec"), actualProvider: "fixture-only" },
    variableIdentity: { ...common, renameMappingScope: "source-codec-identity-only", variables: [] },
    stepIdentity: { ...common, identityMappingScope: "source-codec-identity-only", steps: [{
      surface: "main", editorId: stepId, runnerKey, provenance: "generated", sourceId: null, sourceIdProven: false,
      nativeCheckpointId: null, nativeCheckpointIdProven: false, nativeIdentity: "unknown", ownedSurface: true, hasSyntheticAncestor: false,
      stableIdentityProven: false, identityDenialReason: "generated-editor-id", documentLocalIdentityProven: true, documentLocalIdentityDenialReason: null,
      sourceRowAnchor: { surface: "main", path: "/steps/0", rowHash: hash("fixture-raw-source-row") }, ancestors: [],
    }] },
  };
}
