import assert from "node:assert/strict";
import test from "node:test";
import { createProgramDocumentSession } from "../document/programDocumentSession";
import { createProgramDocumentEditorController } from "./programDocumentEditorController";
import { createProgramDocumentLiveEndpoint } from "./liveProgramDocumentEndpoint";
import { workspaceDocumentKey } from "../../workspace-document-instances";
import type { DesignerCatalogPort } from "../catalog/designerCatalogPort";
import type { StepRunnerInputContract } from "../../step-runner-input-contract";

function fixture() {
  const owner = { cwd: "C:/fixture", path: "action/data.json", tabId: "file:a", instanceId: 1, key: workspaceDocumentKey("C:/fixture", "file:a") };
  const session = createProgramDocumentSession({ content: '{"steps":[{"stepId":"one","stepRunnerKey":"sys:fixture","note":"before","inputParams":{"text":"before"}}],"variables":[],"subPrograms":[]}',
    identity: { documentKey: "fixture", projectBinding: null } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange() {} });
  let blocked = false, flushRejected = false, flushes = 0, metadataCalls = 0, pendingNote: string | undefined;
  let metadata = async () => ({ fixture: true } as unknown as StepRunnerInputContract);
  const endpoint = createProgramDocumentLiveEndpoint({ owner, sessionId: "fixture-session", session, controller, isCurrent: () => true,
    isLiveEditingBlocked: () => blocked,
    catalogPort: { readInputContract: () => { metadataCalls++; return metadata(); } } as unknown as DesignerCatalogPort,
    flushPendingEdits() {
      flushes++;
      if (flushRejected) return false;
      if (pendingNote !== undefined) {
        const present = controller.getSurface("main").getPresent(); present.steps[0]!.note = pendingNote;
        pendingNote = undefined; controller.getSurface("main").commit(present);
      }
    },
  });
  const request = () => ({ expectedRevision: session.getState().revision, expectedIdentity: session.getState().identity, stepId: "one" });
  return { endpoint, session, controller, request, block(value: boolean) { blocked = value; }, draft(value: string) { pendingNote = value; },
    rejectFlush(value: boolean) { flushRejected = value; },
    metadata(read: typeof metadata) { metadata = read; }, counts: () => ({ flushes, metadataCalls }) };
}

test("an unconfirmed modal blocks live reads, metadata and both mutations before flushing or committing", async () => {
  const f = fixture(), before = f.session.getState(); f.draft("compact draft"); f.block(true);
  assert.ok(f.endpoint.getTarget(), "busy is separate from the document's identity");
  assert.throws(() => f.endpoint.flushPendingEdits(), { code: "LIVE_DOCUMENT_BUSY" });
  const read = f.endpoint.read(); assert.equal(read.ok, false); if (!read.ok) assert.equal(read.code, "LIVE_DOCUMENT_BUSY");
  const note = f.endpoint.setStepNote({ ...f.request(), note: "agent note" });
  const inputs = f.endpoint.setStepInputs!({ ...f.request(), expectedRunnerKey: "sys:fixture", changes: [{ key: "text", value: "agent input" }], allowedInputKeys: new Set(["text"]) });
  for (const result of [note, inputs]) { assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "LIVE_DOCUMENT_BUSY"); }
  await assert.rejects(f.endpoint.readInputContract!({ stepRunnerKey: "sys:fixture" }), { code: "LIVE_DOCUMENT_BUSY" });
  assert.equal(f.session.getState(), before); assert.deepEqual(f.counts(), { flushes: 0, metadataCalls: 0 });
});

test("opening a modal during a native metadata read rejects its late result without changing the document", async () => {
  const f = fixture(), before = f.session.getState(); let release!: (contract: StepRunnerInputContract) => void;
  f.metadata(() => new Promise((resolve) => { release = resolve; }));
  const pending = f.endpoint.readInputContract!({ stepRunnerKey: "sys:fixture" });
  assert.equal(f.counts().metadataCalls, 1); f.block(true);
  release({ fixture: true } as unknown as StepRunnerInputContract);
  await assert.rejects(pending, { code: "LIVE_DOCUMENT_BUSY" });
  assert.equal(f.session.getState(), before);
});

test("ordinary compact drafts still flush and modal cancel restores live editing with the original undo baseline", () => {
  const f = fixture(); f.draft("human compact draft"); f.block(true); f.block(false);
  f.endpoint.flushPendingEdits();
  const read = f.endpoint.read(); assert.equal(read.ok, true); if (!read.ok) return;
  assert.match(read.snapshot.content, /human compact draft/);
  const result = f.endpoint.setStepNote({ ...f.request(), note: "agent note" }); assert.equal(result.ok, true);
  f.controller.undo(); assert.equal(f.session.readSnapshot().steps[0]!.note, "human compact draft");
  assert.deepEqual(f.counts(), { flushes: 1, metadataCalls: 0 });
});

test("a modal is scoped to its original endpoint rather than another document", () => {
  const hidden = fixture(), foreground = fixture(); hidden.block(true);
  assert.throws(() => hidden.endpoint.flushPendingEdits(), { code: "LIVE_DOCUMENT_BUSY" });
  foreground.endpoint.flushPendingEdits(); assert.equal(foreground.endpoint.read().ok, true);
  assert.deepEqual(hidden.counts(), { flushes: 0, metadataCalls: 0 });
});

test("a rejected form flush stops live capture without mutating or clearing the human draft", () => {
  const f = fixture(), before = f.session.getState();
  f.draft("retained human draft"); f.rejectFlush(true);
  assert.throws(() => f.endpoint.flushPendingEdits(), { code: "LIVE_DOCUMENT_BUSY" });
  assert.equal(f.session.getState(), before);
  f.rejectFlush(false); f.endpoint.flushPendingEdits();
  assert.match(f.session.getState().content, /retained human draft/);
});

test("a stable endpoint resolves the current catalog and rejects a late result from its replaced port", async () => {
  const session = createProgramDocumentSession({ content: '{"steps":[{"stepId":"one","stepRunnerKey":"sys:fixture","note":"before"}],"variables":[]}', identity: { documentKey: "catalog-lifetime", projectBinding: null } });
  const controller = createProgramDocumentEditorController(session, { isCurrent: () => true, onChange() {} });
  let release!: (value: StepRunnerInputContract) => void, firstCalls = 0, secondCalls = 0;
  const first = { readInputContract: () => { firstCalls++; return new Promise<StepRunnerInputContract>(done => { release = done; }); } } as unknown as DesignerCatalogPort;
  const nextContract = { fixture: "current" } as unknown as StepRunnerInputContract;
  const second = { readInputContract: async () => { secondCalls++; return nextContract; } } as unknown as DesignerCatalogPort;
  let port: DesignerCatalogPort | undefined = first;
  const endpoint = createProgramDocumentLiveEndpoint({ owner: { cwd: "C:/fixture", path: "data.json", tabId: "file", instanceId: 1, key: "catalog-lifetime" },
    sessionId: "same-session", session, controller, isCurrent: () => true, flushPendingEdits() {}, getCatalogPort: () => port });
  const lifetime = endpoint.readStep!("one"); assert.ok(lifetime.ok);
  const pending = endpoint.readInputContract!({ stepRunnerKey: "sys:fixture" }); port = second;
  release({ fixture: "retired" } as unknown as StepRunnerInputContract);
  await assert.rejects(pending, { code: "LIVE_INPUT_CONTRACT_UNAVAILABLE" });
  assert.equal(firstCalls, 1); assert.equal(secondCalls, 0, "the old operation is not replayed through the new port");
  assert.equal(await endpoint.readInputContract!({ stepRunnerKey: "sys:fixture" }), nextContract); assert.equal(secondCalls, 1);
  assert.deepEqual(endpoint.readStep!("one"), lifetime, "catalog refresh preserves the existing row lifetime observer");
  port = undefined; await assert.rejects(endpoint.readInputContract!({ stepRunnerKey: "sys:fixture" }), { code: "LIVE_INPUT_CONTRACT_UNAVAILABLE" });
  assert.equal(session.getState().revision, 0); assert.equal(secondCalls, 1);
});
