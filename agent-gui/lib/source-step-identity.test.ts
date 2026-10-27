import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { readSourceStepIdentity, sourceStepOrigin, verifySourceStepIdentity, type SourceStepIdentity, type SourceStepOrigin } from "./source-step-identity";
import type { SourceBundleDocument } from "./source-bundle-document";
import { readProgramDocumentLiveStep } from "./action-editor/document/programDocumentStepLive";

const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const body = '{"steps":[{"stepId":"s-1","stepRunnerKey":"future:module","note":"before","opaque":9223372036854775807}],"variables":[],"subPrograms":[]}';
function origin(): SourceStepOrigin {
  return { surface: "main", editorId: "s-1", runnerKey: "future:module", provenance: "generated", sourceId: null, sourceIdProven: false,
    nativeCheckpointId: null, nativeCheckpointIdProven: false, nativeIdentity: "unknown", ownedSurface: true, hasSyntheticAncestor: false,
    stableIdentityProven: false, identityDenialReason: "generated-editor-id", documentLocalIdentityProven: true, documentLocalIdentityDenialReason: null,
    sourceRowAnchor: { surface: "main", path: "/steps/0", rowHash: hash("actual-codec-original-row") }, ancestors: [] };
}
function identity(row = origin(), content = body): SourceStepIdentity {
  return { schemaVersion: 1, authorizesLive: false, sourceSnapshot: hash("snapshot"), codecRevision: hash("codec"),
    editorDocumentHash: hash(content), baselineEditorHash: hash(content), mappingEpochKind: "content-bound", mappingEpoch: hash("mapping"),
    view: "observed", identityMappingScope: "source-codec-identity-only", steps: [row] };
}
function document(mapping: unknown, content = body): SourceBundleDocument {
  return { mode: "inspect", editorJson: content, stepIdentity: mapping, codec: { descriptorRevision: hash("codec"), actual: "provider" },
    sourceSnapshot: { revision: hash("snapshot"), codecRevision: hash("codec"), managedRevision: hash("managed"), files: [] } } as unknown as SourceBundleDocument;
}

test("optional source step evidence requires exact observed codec, snapshot and both editor byte hashes", async () => {
  assert.ok(await verifySourceStepIdentity(document(identity())));
  assert.equal(await verifySourceStepIdentity(document(undefined)), undefined);
  for (const field of ["sourceSnapshot", "codecRevision", "editorDocumentHash", "baselineEditorHash"] as const)
    assert.equal(await verifySourceStepIdentity(document({ ...identity(), [field]: hash("wrong") })), undefined, field);
  assert.equal(await verifySourceStepIdentity({ ...document(identity()), codec: { descriptorRevision: hash("other") } }), undefined);
  assert.equal(await verifySourceStepIdentity({ ...document(identity()), mode: "preview" }), undefined);
  assert.equal(await verifySourceStepIdentity(document({ ...identity(), view: "candidate" })), undefined);
  assert.equal(await verifySourceStepIdentity(document(identity(), body + "\n")), undefined, "hash is exact UTF8, not normalized JSON");
});

test("idless document-local proof does not become native proof and native IDs resembling generated IDs remain ordinary facts", async () => {
  const local = sourceStepOrigin(identity(), "main", "s-1")!;
  assert.ok(local); assert.equal(local.nativeIdentity, "unknown"); assert.equal(local.stableIdentityProven, false);
  const native = { ...origin(), provenance: "source" as const, sourceId: "s-1", sourceIdProven: true,
    nativeCheckpointId: "s-1", nativeCheckpointIdProven: true, nativeIdentity: "checkpoint-proven" as const, stableIdentityProven: true, identityDenialReason: null };
  assert.ok(await verifySourceStepIdentity(document(identity(native))));
  const original = identity(), detached = readSourceStepIdentity(original)!;
  (detached.steps[0] as { runnerKey: string }).runnerKey = "poison";
  assert.equal(original.steps[0]!.runnerKey, "future:module");
});

test("codec anchors cannot select another row, scope, module or malformed identity", async () => {
  for (const patch of [
    { surface: "sub-other" }, { runnerKey: "another:module" }, { editorId: "missing" },
    { sourceRowAnchor: { surface: "main", path: "/steps/1", rowHash: hash("row") } },
    { sourceRowAnchor: null }, { ownedSurface: false }, { hasSyntheticAncestor: true },
    { documentLocalIdentityDenialReason: "unproven" },
    { sourceId: null, sourceIdProven: true }, { nativeIdentity: "checkpoint-proven" as const, nativeCheckpointIdProven: false },
  ]) assert.equal(await verifySourceStepIdentity(document(identity({ ...origin(), ...patch }))), undefined, JSON.stringify(patch));
  assert.equal(readSourceStepIdentity({ ...identity(), steps: [origin(), origin()] }), undefined);
  assert.equal(readSourceStepIdentity({ ...identity(), authorizesLive: true }), undefined);
  for (const ancestor of [
    { surface: "sub-parent", editorId: "parent", sourceId: null, sourceIdProven: true, synthetic: false, owned: true },
    { surface: "sub-parent", editorId: "parent", sourceId: " parent", sourceIdProven: true, synthetic: false, owned: true },
    { surface: "sub-parent", editorId: "parent", sourceId: "parent", sourceIdProven: true, synthetic: true, owned: true },
    { surface: "sub-parent", editorId: "parent", sourceId: "parent", sourceIdProven: true, synthetic: false, owned: false },
  ]) assert.equal(await verifySourceStepIdentity(document(identity({ ...origin(), ancestors: [ancestor] }))), undefined);
});

test("raw step location includes branch and owned surface and rejects duplicate or projection-only identities", () => {
  const nested = '{"steps":[],"subPrograms":[{"id":"child","kind":1,"steps":[{"stepId":"parent","stepRunnerKey":"p","ifSteps":[{"stepId":"nested","stepRunnerKey":"n"}]}]}]}';
  assert.deepEqual(readProgramDocumentLiveStep(nested, "nested"), { stepId: "nested", surface: "sub-child", path: "/steps/0/ifSteps/0", documentPath: "/subPrograms/0/steps/0/ifSteps/0", runnerKey: "n" });
  for (const raw of [nested.replace('"kind":1', '"kind":2'), body.replace('"stepId":"s-1",', ""), body.replace('"stepRunnerKey":"future:module"', '"stepRunnerKey":"future:module","key":"other"'), body.replace('"opaque":9223372036854775807', '"ifSteps":[{"stepId":"s-1","stepRunnerKey":"dup"}]')])
    assert.throws(() => readProgramDocumentLiveStep(raw, raw.includes("nested") ? "nested" : "s-1"));
});
