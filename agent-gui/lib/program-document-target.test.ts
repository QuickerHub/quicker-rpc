import assert from "node:assert/strict";
import { test } from "node:test";
import { createProgramDocumentSession } from "./action-editor/document/programDocumentSession";
import { parseActionProjectBinding } from "./action-project-binding";
import { readProgramDocumentTargetClient } from "./program-document-save-client";
import { pushActionProjectToQuickerApi, pullActionProjectFromQuicker, fetchActionProjectSyncStatus } from "./action-project-sync-client";
import { readActionProjectSyncCache, writeActionProjectSyncCache, invalidateActionProjectSyncCache } from "./action-project-sync-cache";
import { actionProjectSyncTargetKey } from "./action-project-sync-target";

const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const projectDirectory = `.quicker/actions/${id}`;
const projectBinding = parseActionProjectBinding({ schemaVersion: 1, kind: "action", actionId: id, hostBinding: {
  hostInstanceId: "fixture-a", hostSessionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  endpoint: "QuickerRpc_User_AAAAAAAAAAAAAAAAAAAAAAAA_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: { read: true },
} }, id);
const target = { projectDirectory, projectBinding };
const other = { ...target, projectBinding: { ...projectBinding, hostBinding: { ...projectBinding.hostBinding, hostInstanceId: "fixture-b" } } };
const content = '{"steps":[{"stepRunnerKey":"sys:delay"}],"variables":[]}';

async function fakeFetch(fetch: typeof globalThis.fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fetch;
  try { await run(); } finally { globalThis.fetch = original; }
}

test("identity attaches to the same dirty session and ticket without replacing body or metadata drafts", () => {
  const session = createProgramDocumentSession({ content, identity: { documentKey: "fixture" }, metadata: { path: "info.json", content: '{"title":"before"}' } });
  const snapshot = session.readSnapshot(); snapshot.steps[0]!.note = "draft before identity read";
  session.applySnapshot(snapshot, { expectedRevision: 0, source: "ui" });
  session.applyMetadata({ title: "draft title" }, { expectedRevision: 1, source: "ui" });
  const before = session.getState();
  assert.equal(session.reconcileProjectBinding(projectBinding).ok, true);
  assert.equal(session.getState().content, before.content);
  assert.equal(session.getState().metadata, before.metadata);
  assert.equal(session.getState().dirty, true);
  assert.equal(session.getState().revision, before.revision + 1);
  assert.equal(Object.isFrozen(session.getState().identity.projectBinding!.hostBinding.capabilities), true);
  const save = session.beginSave(() => session.readSnapshot()); assert.ok(save.ok);
  assert.deepEqual(save.ticket.identity.projectBinding, projectBinding);
  const changedTarget = session.completeSave(save.ticket, { ok: true, identity: { ...save.ticket.identity, projectBinding: other.projectBinding } });
  assert.equal(changedTarget.ok, false);
  if (!changedTarget.ok) assert.equal(changedTarget.code, "identity_conflict");
  assert.equal(session.getState().baselineContent, content);
  assert.equal(session.getState().dirty, true);
});

test("explicit unbound identity cannot silently adopt a later target and closed sessions reject late reads", () => {
  const session = createProgramDocumentSession({ content, identity: { documentKey: "fixture" } });
  assert.equal(session.reconcileProjectBinding(null).ok, true);
  const before = session.getState();
  const changed = session.reconcileProjectBinding(projectBinding);
  assert.equal(changed.ok, false);
  if (!changed.ok) assert.equal(changed.code, "identity_conflict");
  assert.equal(session.getState(), before);
  session.close();
  assert.equal(session.reconcileProjectBinding(null).ok, false);
});

test("local target reader distinguishes unbound, complete binding and invalid response without host discovery", async () => {
  for (const binding of [null, projectBinding]) {
    await fakeFetch(async (input, init) => {
      const url = new URL(String(input), "http://fixture.invalid");
      assert.equal(url.searchParams.get("op"), "program-document-target");
      assert.equal(url.searchParams.get("path"), `${projectDirectory}/data.json`);
      assert.equal(init?.cache, "no-store");
      return Response.json({ ok: true, projectDirectory, projectBinding: binding });
    }, async () => assert.deepEqual(await readProgramDocumentTargetClient("fixture", `${projectDirectory}/data.json`), { ok: true, projectDirectory, projectBinding: binding }));
  }
  await fakeFetch(async () => Response.json({ ok: true, projectDirectory, projectBinding: {} }), async () => {
    assert.equal((await readProgramDocumentTargetClient("fixture", `${projectDirectory}/data.json`)).ok, false);
  });
  await fakeFetch(async () => Response.json({ ok: true, projectDirectory: ".quicker/actions/other", projectBinding }), async () => {
    const result = await readProgramDocumentTargetClient("fixture", `${projectDirectory}/data.json`);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /another project directory/);
  });
  await fakeFetch(async () => Response.json({ ok: false, code: "unsafe_path", error: "unsafe fixture" }), async () => {
    assert.deepEqual(await readProgramDocumentTargetClient("fixture", `${projectDirectory}/data.json`), { ok: false, code: "unsafe_path", error: "unsafe fixture" });
  });
});

test("sync client verifies actual target before cache updates and ignores a late previous document response", async () => {
  let current = true;
  let release!: (response: Response) => void;
  await fakeFetch(async (_input, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { cwd: "fixture", op: "push", actionId: id, projectDirectory, expectedProjectBinding: projectBinding });
    return new Promise((resolve) => { release = resolve; });
  }, async () => {
    const saving = pushActionProjectToQuickerApi("fixture", id, { target, isCurrent: () => current });
    current = false;
    release(Response.json({ ok: true, editVersion: 42, projectDirectory, projectBinding }));
    const result = await saving;
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "stale_response");
    assert.equal(readActionProjectSyncCache("fixture", id, target), undefined);
  });
  for (const response of [{}, { projectDirectory, projectBinding: other.projectBinding }, { projectDirectory: ".quicker/actions/another", projectBinding }]) {
    await fakeFetch(async () => Response.json({ ok: true, editVersion: 42, ...response }), async () => {
      const result = await pushActionProjectToQuickerApi("fixture", id, { target });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.code, "identity_conflict");
      assert.equal(readActionProjectSyncCache("fixture", id, target), undefined);
    });
  }
  await fakeFetch(async () => Response.json({ ok: true, editVersion: 42, projectDirectory, projectBinding }), async () => {
    assert.equal((await pushActionProjectToQuickerApi("fixture", id, { target })).ok, true);
    assert.equal(readActionProjectSyncCache("fixture", id, target)?.state, "in_sync");
    assert.equal(readActionProjectSyncCache("fixture", id, other), undefined);
    invalidateActionProjectSyncCache("fixture", id, target);
  });
});

test("sync status failures retain structured backend codes and target cache identities include directory and complete binding", async () => {
  await fakeFetch(async () => Response.json({ ok: false, error: "fixture mismatch", code: "HOST_BINDING_MISMATCH", retryable: false }, { status: 409 }), async () => {
    const result = await fetchActionProjectSyncStatus("fixture", id, { target });
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.code, "HOST_BINDING_MISMATCH"); assert.equal(result.retryable, false); }
  });
  writeActionProjectSyncCache("fixture", id, { state: "in_sync", message: "A", error: false }, target);
  assert.notEqual(actionProjectSyncTargetKey(target), actionProjectSyncTargetKey(other));
  assert.equal(readActionProjectSyncCache("fixture", id, { ...target, projectDirectory: ".quicker/actions/other" }), undefined);
  assert.equal(readActionProjectSyncCache("fixture", id), undefined);
  invalidateActionProjectSyncCache("fixture", id, target);
});

test("the public client rechecks ownership after the inner promise before any optimistic cache or event", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let events = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent() { events++; } } });
  try {
    for (const invoke of [fetchActionProjectSyncStatus, pullActionProjectFromQuicker, pushActionProjectToQuickerApi]) {
      const capturedOwner = { label: "A" };
      let owner = capturedOwner;
      let checked = false;
      const isCurrent = () => {
        if (!checked) {
          checked = true;
          queueMicrotask(() => { owner = { label: "B" }; owner = { label: "A" }; });
        }
        return owner === capturedOwner;
      };
      await fakeFetch(async () => Response.json({ ok: true, projectDirectory, projectBinding, editVersion: 42,
        summary: { projectDirectory, editVersion: 42 }, status: { state: "in_sync", message: "should stay stale", localEditVersion: 42, remoteEditVersion: 42 } }), async () => {
        const result = await invoke("fixture", id, { target, isCurrent });
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal(result.code, "stale_response");
        assert.equal(readActionProjectSyncCache("fixture", id, target), undefined);
      });
    }
    assert.equal(events, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window");
  }
});
