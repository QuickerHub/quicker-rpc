import assert from "node:assert/strict";
import { test } from "node:test";
import { createSourceBundleDocumentClient } from "./source-bundle-document-client";
import { createProgramDocumentSession } from "./action-editor/document/programDocumentSession";
import type { SourceBundleDocument } from "./source-bundle-document";
import { createHash } from "node:crypto";
import { sourceStepTestTarget } from "./source-step-live-test-fixture";

const body = '{"steps":[{"stepId":"s1","stepRunnerKey":"sys:comment","note":"before"}],"variables":[],"opaque":9223372036854775807}';
function document(): SourceBundleDocument {
  return { schemaVersion: 1, kind: "source-bundle-document", mode: "inspect", projectDirectoryAbsolute: "/workspace/owned", actionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", editVersion: "9223372036854775806",
    hostBinding: null, storageIdentity: null, identityJson: "{}", sourceYaml: "# unchanged source\n", editorJson: body, codec: { descriptorRevision: "codec" },
    sourceSnapshot: { revision: "snapshot", managedRevision: "managed", codecRevision: "codec", files: [{ path: "program.source.yaml", sha256: "bytes", bytes: 19 }] },
    pending: { status: "clean", comparedTo: "managed-native-checkpoint", nativeState: "unobserved", currentBodyHash: "body", baselineBodyHash: "body" },
    capabilities: { read: true, preview: true, saveLocal: true, metadataWrite: false, nativeSync: "unobserved", snapshotAuthorizesWrite: false },
    projection: { format: "quicker.editor-json.v1", metadataEditable: false } };
}
function ticket() {
  const session = createProgramDocumentSession({ content: body, identity: { documentKey: "source-session", storage: { key: "source", version: "snapshot" } } });
  session.transact({ expectedRevision: 0, source: "ui", update(raw) { (raw.steps as { note: string }[])[0].note = "first edit"; } });
  const started = session.beginSave(() => session.readSnapshot()); assert.ok(started.ok);
  return { session, ticket: started.ticket };
}
async function opened(onPost: (input: Record<string, unknown>) => Promise<Response>, initialDocument = document()) {
  const originalFetch = globalThis.fetch;
  let ready!: () => void; const connected = new Promise<void>(done => { ready = done; });
  let posts = 0, changes = 0;
  const ownerKey = "source-owner", path = "owned/program.source.yaml";
  globalThis.fetch = async (url, init) => {
    if (init?.method === "POST") { posts++; return onPost(JSON.parse(String(init.body))); }
    assert.ok(String(url).startsWith("/api/workspace?"));
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ ownerKey, path, ownerToken: "lease", document: initialDocument }) + "\n"));
      init?.signal?.addEventListener("abort", () => { try { controller.close(); } catch {} }, { once: true });
    } }));
  };
  const client = createSourceBundleDocumentClient({ cwd: "/workspace", path, ownerKey, onChange(state) { changes++; if (state.ownerToken) ready(); } });
  const connection = client.connect(); await connected;
  return { client, posts: () => posts, changes: () => changes, async close() { client.close(); await connection; globalThis.fetch = originalFetch; } };
}

test("source getter preserves the complete codec and returns detached facts without exposing its verified map", async () => {
  const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
  const initial = { ...document(), codec: { descriptorRevision: hash("codec"), producer: { identity: "actual-codec" } },
    sourceSnapshot: { ...document().sourceSnapshot, revision: hash("snapshot"), codecRevision: hash("codec") },
    variableIdentity: { schemaVersion: 1, authorizesLive: false, view: "observed", renameMappingScope: "source-codec-identity-only",
      sourceSnapshot: hash("snapshot"), codecRevision: hash("codec"), editorDocumentHash: hash(body), baselineEditorHash: hash(body),
      mappingEpochKind: "content-bound", mappingEpoch: hash("mapping"), variables: [] },
    stepIdentity: sourceStepTestTarget(body, "s1", "sys:comment").stepIdentity };
  const f = await opened(async () => assert.fail("getter cannot dispatch"), initial);
  try {
    const first = f.client.getLiveSourceTarget(body)!;
    assert.ok(first); assert.deepEqual(first.codec, initial.codec);
    (first.codec as { producer: { identity: string } }).producer.identity = "poison";
    (first.sourceSnapshot.files[0] as { sha256: string }).sha256 = "poison";
    (first.variableIdentity as { authorizesLive: boolean }).authorizesLive = true;
    assert.ok(first.stepIdentity);
    (first.stepIdentity.steps[0] as { runnerKey: string }).runnerKey = "poison";
    const next = f.client.getLiveSourceTarget(body)!;
    assert.deepEqual(next.codec, initial.codec); assert.equal(next.variableIdentity.authorizesLive, false);
    assert.notEqual(next.sourceSnapshot.files[0].sha256, "poison");
    assert.equal(next.stepIdentity!.steps[0]!.runnerKey, "sys:comment");
    assert.ok(Object.isFrozen(f.client.getState().document!.codec));
    assert.ok(Object.isFrozen(f.client.getState().document!.sourceSnapshot.files));
    assert.equal(f.posts(), 0);
  } finally { await f.close(); }
});

test("missing or malformed optional step metadata does not remove verified variable/local-save access", async () => {
  for (const stepIdentity of [undefined, { authorizesLive: true }, { ...sourceStepTestTarget(body, "s1", "sys:comment").stepIdentity, editorDocumentHash: "wrong" }]) {
    const facts = sourceStepTestTarget(body, "s1", "sys:comment");
    const initial = { ...document(), codec: facts.codec, sourceSnapshot: facts.sourceSnapshot, variableIdentity: facts.variableIdentity, stepIdentity };
    const f = await opened(async () => assert.fail("reading a missing optional field cannot dispatch"), initial);
    try { const target = f.client.getLiveSourceTarget(body); assert.ok(target); assert.equal(target.stepIdentity, undefined); assert.ok(target.variableIdentity); }
    finally { await f.close(); }
  }
});

test("browser-to-Node source save acknowledgement loss blocks every later save/sync without replay", async () => {
  for (const kind of ["fetch-throw", "bad-json", "invalid-envelope", "missing-code", "wrong-mode", "wrong-body", "http-conflict"]) {
    const f = ticket();
    const openedClient = await opened(async () => {
      if (kind === "fetch-throw") throw Error("connection lost after fetch began");
      if (kind === "bad-json") return new Response("{broken", { status: 200 });
      if (kind === "invalid-envelope") return Response.json({ nope: true });
      if (kind === "missing-code") return Response.json({ ok: false, error: "unconfirmed" });
      const ack = { ...document(), mode: kind === "wrong-mode" ? "inspect" : "save-local", editorJson: kind === "wrong-body" ? body : f.ticket.content,
        saveLocal: { baselineAdvanced: false, normalization: "codec-normalized", writtenFiles: ["program.source.yaml"] } };
      return Response.json({ ok: true, sourceDocument: ack }, { status: kind === "http-conflict" ? 409 : 200 });
    });
    try {
      const result = await openedClient.client.save(f.ticket); assert.equal(result.ok, false, kind);
      if (!result.ok) { assert.equal(result.code, "WRITE_RESULT_UNKNOWN", kind); assert.ok(result.sourceReceipt, kind); }
      assert.equal(openedClient.client.getState().blocked, true, kind); assert.equal(openedClient.posts(), 1, kind);
      assert.equal((await openedClient.client.save(f.ticket)).ok, false); assert.equal((await openedClient.client.sync()).ok, false);
      assert.equal(openedClient.posts(), 1, kind); assert.equal(f.session.getState().content, f.ticket.content);
      assert.deepEqual(openedClient.client.getLastSaveReceipt(), result);
    } finally { await openedClient.close(); }
  }
});

test("source client rejects an invalid local ticket before fetch while a valid owner remains usable", async () => {
  const f = await opened(async () => assert.fail("invalid ticket cannot dispatch"));
  try {
    const result = await f.client.save({ ...ticket().ticket, content: 123 as never });
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "SOURCE_DOCUMENT_REQUEST");
    assert.equal(f.posts(), 0); assert.equal(f.client.getState().blocked, false);
  } finally { await f.close(); }
});

test("source save receipt advances only its ticket while concurrent Session edits and history survive", async () => {
  const f = ticket(); let finish!: (response: Response) => void, dispatched!: () => void;
  const posted = new Promise<void>(done => { dispatched = done; });
  const connection = await opened(async request => {
    assert.equal(request.format, "source-bundle"); assert.equal(request.content, f.ticket.content); assert.equal(request.expectedContent, f.ticket.baselineContent);
    dispatched(); return new Promise<Response>(done => { finish = done; });
  });
  try {
    const saving = connection.client.save(f.ticket); await posted;
    f.session.transact({ expectedRevision: f.session.getState().revision, source: "ui", update(raw) { (raw.steps as { note: string }[])[0].note = "second concurrent edit"; } });
    const ack = { ...document(), mode: "save-local", editorJson: f.ticket.content, sourceSnapshot: { ...document().sourceSnapshot, revision: "saved-snapshot" },
      saveLocal: { baselineAdvanced: false, normalization: "codec-normalized", writtenFiles: ["program.source.yaml"] } };
    finish(Response.json({ ok: true, sourceDocument: ack }));
    const result = await saving; assert.ok(result.ok); f.session.completeSave(f.ticket, result);
    assert.equal(f.session.getState().baselineContent, f.ticket.content); assert.match(f.session.getState().content, /second concurrent edit/);
    assert.equal(f.session.getState().dirty, true); assert.equal(f.session.getState().history.canUndo, true);
    assert.equal(connection.client.getState().document!.sourceSnapshot.revision, "saved-snapshot");
    assert.equal(connection.client.getState().document!.editorJson, f.ticket.content);
    assert.match(f.session.getState().content, /9223372036854775807/);
  } finally { await connection.close(); }
});
