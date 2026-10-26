import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createProgramDocumentSession } from "./action-editor/document/programDocumentSession";
import { openSourceBundleDocumentResponse, editSourceBundleDocument, syncSourceBundleDocument, withSourceBundleCatalog } from "./source-bundle-document.server";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import type { SourceBundleDocument, SourceBundleDocumentRequest } from "./source-bundle-document";
import type { QkrpcRunResult } from "./qkrpc-types";

const oldVersion = "9223372036854775806", newVersion = "9223372036854775807";
const oldHash = `sha256:${"a".repeat(64)}`, lateHash = `sha256:${"b".repeat(64)}`;
const initial = '{"steps":[{"stepId":"s","stepRunnerKey":"sys:comment","note":"before"}],"variables":[],"opaque":9223372036854775807}';
function document(directory: string): SourceBundleDocument {
  return { schemaVersion: 1, kind: "source-bundle-document", mode: "inspect", projectDirectoryAbsolute: directory,
    actionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", editVersion: oldVersion,
    hostBinding: { hostInstanceId: "fixture", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      hostKind: "v1", quickerVersion: "fixture", protocolVersion: 1, schemaVersion: 1, capabilities: { "action.source.write": true } },
    storageIdentity: { draft: "old", revision: "before" }, identityJson: "{}", sourceYaml: "# original\n", editorJson: initial,
    codec: { descriptorRevision: "codec" }, sourceSnapshot: { revision: "snapshot", managedRevision: "managed", codecRevision: "codec", files: [{ path: "program.source.yaml", sha256: "yaml", bytes: 11 }] },
    pending: { status: "pending", comparedTo: "managed-native-checkpoint", nativeState: "unobserved", currentBodyHash: oldHash, baselineBodyHash: lateHash },
    capabilities: { read: true, preview: true, saveLocal: true, metadataWrite: false, nativeSync: "unobserved", snapshotAuthorizesWrite: false },
    projection: { format: "quicker.editor-json.v1", metadataEditable: false } };
}
function response(data: unknown, ok = true): QkrpcRunResult { return { ok, exitCode: ok ? 0 : 1, stdout: "", stderr: "", parsed: data, truncated: false }; }
async function fixture(run: (context: { root: string; directory: string; before: SourceBundleDocument; open: (runDocument: (request: SourceBundleDocumentRequest) => Promise<QkrpcRunResult>) => Promise<{ ownerToken: string; close(): Promise<void> }> }) => Promise<void>) {
  const parent = fileURLToPath(new URL("../../.tmp/source-bundle-designer/server/", import.meta.url)); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "case-")), directory = join(root, "owned"); await mkdir(directory); await writeFile(join(directory, "program.source.yaml"), "# original\n");
  const before = document(directory);
  try {
    await runWithAgentRequestContextAsync({ cwd: root }, () => run({ root, directory, before, async open(runDocument) {
      const request = new Request("http://fixture.invalid/api/workspace");
      const opened = await openSourceBundleDocumentResponse(request, "owned/program.source.yaml", "original-owner", { runDocument });
      assert.equal(opened.status, 200); const reader = opened.body!.getReader(); const part = await reader.read();
      const message = JSON.parse(new TextDecoder().decode(part.value)); assert.equal(message.ok, true);
      return { ownerToken: message.ownerToken, async close() { await reader.cancel(); reader.releaseLock(); } };
    } }));
  } finally { assert.ok(root.startsWith(join(parent, "case-"))); await rm(root, { recursive: true, force: true }); }
}

test("source catalogs require the complete stored host record and reject a snapshot changed during the read", async () => {
  for (const kind of ["reordered", "version", "capability", "late-snapshot"]) await fixture(async f => {
    let changed = false, queries = 0;
    const runDocument = async () => response({ ok: true, data: changed
      ? { ...f.before, sourceSnapshot: { ...f.before.sourceSnapshot, revision: "external-edit" } } : f.before });
    const owner = await f.open(runDocument);
    try {
      const expected = { ...f.before.hostBinding!, capabilities: { ...f.before.hostBinding!.capabilities } };
      if (kind === "version") expected.quickerVersion = "other-version";
      if (kind === "capability") expected.capabilities["action.source.write"] = false;
      const reordered = Object.fromEntries(Object.entries(expected).reverse()) as typeof expected;
      const reading = withSourceBundleCatalog({ path: "owned/program.source.yaml", ownerToken: owner.ownerToken, expectedSnapshot: "snapshot" },
        reordered, async actual => {
          queries++; assert.deepEqual(actual, f.before.hostBinding);
          if (kind === "late-snapshot") changed = true;
          return "catalog-result";
        }, undefined, { runDocument });
      if (kind === "reordered") assert.equal(await reading, "catalog-result");
      else await assert.rejects(reading, error => (error as { code: string }).code === (kind === "late-snapshot" ? "SOURCE_SNAPSHOT_CONFLICT" : "HOST_BINDING_REQUIRED"));
      assert.equal(queries, kind === "version" || kind === "capability" ? 0 : 1, kind);
    } finally { await owner.close(); }
  });
});

test("local source ACK correlation refuses wrong bundle/mode/body without advancing the Session ticket", async () => {
  for (const kind of ["directory", "mode", "body", "managed", "codec"]) await fixture(async f => {
    const runDocument = async (request: SourceBundleDocumentRequest) => {
      if (request.mode === "inspect") return response({ ok: true, data: f.before });
      const ack = { ...f.before, mode: "save-local", editorJson: request.editorJson,
        saveLocal: { writtenFiles: ["program.source.yaml"], baselineAdvanced: false, normalization: "codec-normalized" },
        sourceSnapshot: { ...f.before.sourceSnapshot, revision: "saved" } };
      if (kind === "directory") ack.projectDirectoryAbsolute = join(f.root, "different");
      if (kind === "mode") ack.mode = "inspect";
      if (kind === "body") ack.editorJson = initial;
      if (kind === "managed") ack.sourceSnapshot.managedRevision = "unexpected-checkpoint";
      if (kind === "codec") ack.sourceSnapshot.codecRevision = "different-codec";
      return response({ ok: true, data: ack });
    };
    const owner = await f.open(runDocument);
    try {
      const session = createProgramDocumentSession({ content: initial, identity: { documentKey: "source-session" } });
      session.transact({ expectedRevision: 0, source: "ui", update(raw) { (raw.steps as { note: string }[])[0].note = "manual draft"; } });
      const started = session.beginSave(() => session.readSnapshot()); assert.ok(started.ok);
      const result = await editSourceBundleDocument("save-local", { path: "owned/program.source.yaml", ownerToken: owner.ownerToken,
        expectedSnapshot: "snapshot", editorJson: started.ticket.content, baselineEditorJson: started.ticket.baselineContent }, { runDocument });
      assert.equal(result.ok, false, kind); if (!result.ok) { assert.equal(result.code, "WRITE_RESULT_UNKNOWN"); assert.ok(result.receipt); }
      session.completeSave(started.ticket, result);
      assert.equal(session.getState().baselineContent, initial); assert.equal(session.getState().dirty, true); assert.match(session.getState().content, /manual draft/);
    } finally { await owner.close(); }
  });
});

test("source sync correlates exact hash/version/storage receipts and permits later working bytes to remain pending", async () => {
  for (const kind of ["valid-late", "wrong-hash", "wrong-action", "wrong-version-readback", "wrong-baseline-readback", "wrong-storage-readback", "wrong-host-record-readback", "missing-version", "dry-run-other-hash"]) await fixture(async f => {
    let committed = false, commits = 0;
    const storage = { draft: "new-native-draft", revision: "after" };
    const runDocument = async () => response({ ok: true, data: !committed ? f.before : { ...f.before, editVersion: kind === "wrong-version-readback" ? oldVersion : newVersion,
      storageIdentity: kind === "wrong-storage-readback" ? { draft: "foreign" } : storage, sourceYaml: "# later external edit\n",
      hostBinding: kind === "wrong-host-record-readback" ? { ...f.before.hostBinding!, quickerVersion: "different-host-record" } : f.before.hostBinding,
      sourceSnapshot: { ...f.before.sourceSnapshot, revision: "after", managedRevision: "checkpoint-updated" },
      pending: { ...f.before.pending, status: "pending", currentBodyHash: lateHash, baselineBodyHash: kind === "wrong-baseline-readback" ? lateHash : oldHash } } });
    const owner = await f.open(runDocument);
    try {
      const runSync = async (_args: string[], dryRun: boolean) => {
        if (dryRun) return response({ ok: true, dryRun: true, actionId: f.before.actionId, editVersion: oldVersion, projectDirectoryAbsolute: f.directory,
          consumedSnapshot: "snapshot", consumedBodyHash: kind === "dry-run-other-hash" ? lateHash : oldHash });
        commits++; committed = true;
        return response({ persisted: true, actionId: kind === "wrong-action" ? "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee" : f.before.actionId,
          editVersion: kind === "missing-version" ? undefined : newVersion, consumedSnapshot: "snapshot", consumedBodyHash: kind === "wrong-hash" ? lateHash : oldHash,
          hostSaveStatus: "confirmed", checkpointStatus: "updated", storageIdentity: storage });
      };
      const result = await syncSourceBundleDocument({ path: "owned/program.source.yaml", ownerToken: owner.ownerToken, expectedSnapshot: "snapshot" }, { runDocument, runSync });
      if (kind === "valid-late") { assert.ok(result.ok); assert.equal(result.document.pending.status, "pending"); assert.equal(result.document.pending.nativeState, "unobserved"); assert.equal(result.document.editVersion, newVersion); }
      else { assert.equal(result.ok, false, kind); if (!result.ok) assert.ok(result.receipt, kind); }
      assert.equal(commits, kind === "dry-run-other-hash" ? 0 : 1, kind);
    } finally { await owner.close(); }
  });
});

test("source native partial/unknown outcomes keep the original receipt and never replay or read back as success", async () => {
  for (const code of ["SOURCE_CHECKPOINT_FAILED", "WRITE_RESULT_UNKNOWN"]) await fixture(async f => {
    let inspections = 0, commits = 0;
    const runDocument = async () => { inspections++; return response({ ok: true, data: f.before }); };
    const owner = await f.open(runDocument);
    try {
      const raw = { ok: false, error: code, message: "fixture native outcome", data: { persisted: code === "SOURCE_CHECKPOINT_FAILED" ? true : null,
        consumedSnapshot: "snapshot", consumedBodyHash: oldHash, hostSaveStatus: code === "SOURCE_CHECKPOINT_FAILED" ? "confirmed" : "unknown", checkpointStatus: "failed" } };
      const runSync = async (_args: string[], dryRun: boolean) => dryRun
        ? response({ ok: true, dryRun: true, actionId: f.before.actionId, editVersion: oldVersion, projectDirectoryAbsolute: f.directory, consumedSnapshot: "snapshot", consumedBodyHash: oldHash })
        : (commits++, response(raw, false));
      const result = await syncSourceBundleDocument({ path: "owned/program.source.yaml", ownerToken: owner.ownerToken, expectedSnapshot: "snapshot" }, { runDocument, runSync });
      assert.equal(result.ok, false); if (!result.ok) { assert.equal(result.code, code); assert.deepEqual(result.receipt, raw); }
      assert.equal(commits, 1); assert.equal(inspections, 2); assert.equal(await readFile(join(f.directory, "program.source.yaml"), "utf8"), "# original\n");
    } finally { await owner.close(); }
  });
});
