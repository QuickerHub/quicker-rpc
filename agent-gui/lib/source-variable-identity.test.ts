import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { SourceBundleDocument } from "./source-bundle-document";
import { readSourceVariableIdentity, sourceVariableOrigin, verifySourceVariableIdentity, type SourceVariableIdentity } from "./source-variable-identity";
import { isLiveProgramSourceTarget } from "./live-program-source-target";

const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const body = '{"variables":[{"id":"v-1","key":"A","opaque":9223372036854775807}],"steps":[]}';
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] extends readonly (infer Item)[] ? Mutable<Item>[] : T[Key] };
function identity(): Mutable<SourceVariableIdentity> {
  return { schemaVersion: 1, authorizesLive: false, sourceSnapshot: hash("snapshot"), codecRevision: hash("codec"),
    editorDocumentHash: hash(body), baselineEditorHash: hash(body), mappingEpochKind: "content-bound", mappingEpoch: hash("mapping"), view: "observed", renameMappingScope: "source-codec-identity-only",
    variables: [{ surface: "main", editorId: "v-1", provenance: "generated", sourceId: null, sourceIdProven: false,
      nativeCheckpointId: null, nativeCheckpointIdProven: false, nativeIdentity: "unknown", ownedSurface: true, hasSyntheticAncestor: false,
      stableIdentityProven: false, identityDenialReason: "source-has-no-stable-id", ancestors: [], renameMappingProven: false,
      renameMappingDenialReason: "native-mapping-unproven", renameMappingBasis: "unproven", documentLocalIdentityProven: true, documentLocalIdentityDenialReason: null,
      sourceRowAnchor: { surface: "main", key: "A", rowHash: hash("actual-codec-original-row") } }] };
}
function document(mapping: unknown, content = body): SourceBundleDocument {
  return { mode: "inspect", editorJson: content, variableIdentity: mapping,
    sourceSnapshot: { revision: hash("snapshot"), codecRevision: hash("codec"), managedRevision: hash("managed"), files: [] } } as unknown as SourceBundleDocument;
}

test("source provenance requires the exact observed editor and baseline bytes plus snapshot/codec; candidate or old wire cannot authorize", async () => {
  assert.ok(await verifySourceVariableIdentity(document(identity())));
  for (const kind of ["editor", "baseline", "snapshot", "codec", "candidate", "old"]) {
    const row = identity();
    if (kind === "editor") row.editorDocumentHash = hash("different editor");
    if (kind === "baseline") row.baselineEditorHash = hash("old baseline");
    if (kind === "snapshot") row.sourceSnapshot = hash("foreign snapshot");
    if (kind === "codec") row.codecRevision = hash("foreign codec");
    if (kind === "candidate") row.view = "candidate";
    assert.equal(await verifySourceVariableIdentity(document(kind === "old" ? undefined : row)), undefined, kind);
  }
  assert.equal(await verifySourceVariableIdentity(document(identity(), body.replace('"A"', '"B"'))), undefined);
  const wrongRow = identity();
  wrongRow.variables[0].sourceRowAnchor = { surface: "main", key: "B", rowHash: hash("other-row") };
  assert.equal(await verifySourceVariableIdentity(document(wrongRow)), undefined, "an exact editor hash cannot reassign an anchor to another row");
});

test("codec-proven document-local idless rows remain distinct from native identity; absent/ambiguous/foreign anchors do not qualify", () => {
  const mapping = identity();
  const local = sourceVariableOrigin(mapping, "main", "v-1");
  assert.ok(local); assert.equal(local.nativeIdentity, "unknown"); assert.equal(local.stableIdentityProven, false); assert.equal(local.renameMappingProven, false);
  assert.equal(sourceVariableOrigin(mapping, "sub-other", "v-1"), undefined);
  for (const kind of ["missing-anchor", "unproven", "ancestor", "not-owned"]) {
    const changed = structuredClone(mapping), row = changed.variables[0];
    if (kind === "missing-anchor") row.sourceRowAnchor = null;
    if (kind === "unproven") row.documentLocalIdentityProven = false;
    if (kind === "ancestor") row.hasSyntheticAncestor = true;
    if (kind === "not-owned") row.ownedSurface = false;
    assert.equal(sourceVariableOrigin(changed, "main", "v-1"), undefined, kind);
  }
  assert.equal(readSourceVariableIdentity({ ...mapping, authorizesLive: true }), undefined);
  assert.equal(readSourceVariableIdentity({ ...mapping, variables: [...mapping.variables, mapping.variables[0]] }), undefined);
  const target = { actionId: "source-action", hostBinding: null, storageIdentity: null, ownerToken: "lease", mappingEpoch: 1,
    sourceSnapshot: document(mapping).sourceSnapshot, variableIdentity: mapping };
  assert.equal(isLiveProgramSourceTarget(target), true);
  assert.equal(isLiveProgramSourceTarget({ ...target, variableIdentity: { ...mapping, view: "candidate" } }), false);
});
