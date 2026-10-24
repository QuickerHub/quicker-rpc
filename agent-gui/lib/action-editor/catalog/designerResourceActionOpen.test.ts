import assert from "node:assert/strict";
import { test } from "node:test";
import { createDesignerCatalogPort } from "./designerCatalogPort";
import type { DesignerCatalogContext } from "./designerCatalogContext";
import type { WorkspaceDocumentOwner } from "../../workspace-document-instances";

const actionId = "22222222-2222-4222-8222-222222222222", requestId = "33333333-3333-4333-8333-333333333333";
const source = ".quicker/actions/source", directory = `.quicker/actions/open-${requestId}`;
function context(body = true, kind: "v1" | "v2" = "v1"): DesignerCatalogContext {
  return { cwd: "C:/fixture", projectDirectory: source, expectedProjectBinding: { schemaVersion: 1, kind: "action", actionId: "11111111-1111-4111-8111-111111111111", hostBinding: {
    hostInstanceId: "fixture", hostSessionId: "a".repeat(32), endpoint: `QuickerRpc_User_${"A".repeat(24)}_${"a".repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: kind, quickerVersion: "fixture", capabilities: { "resource.action.page.read": true, "action.legacyBody.read": body },
  } } };
}
const owner: WorkspaceDocumentOwner = { key: "owner", instanceId: 1, cwd: "C:/fixture", tabId: "source", path: `${source}/data.json` };
const success = (scope: DesignerCatalogContext) => ({ ok: true, actionId, projectDirectory: directory, path: `${directory}/data.json`,
  projectBinding: { ...scope.expectedProjectBinding!, actionId }, origin: "exported", localPersistence: "confirmed" });

test("resource summaries alone, V2, unresolved and disposed ports do not authorize an action export", async () => {
  let calls = 0; const fetcher: typeof fetch = async () => { calls++; throw Error("Unexpected export"); };
  for (const scope of [null, undefined, context(false), context(true, "v2"), { ...context(), expectedProjectBinding: null }]) {
    const port = createDesignerCatalogPort(scope, fetcher);
    assert.equal(port.resourceActionOpenAvailable, false);
    const result = await port.openResourceAction(actionId, requestId, owner); assert.equal(result.ok, false);
    assert.equal(result.localPersistence, "none");
  }
  const disposed = createDesignerCatalogPort(context(), fetcher); disposed.dispose();
  assert.equal((await disposed.openResourceAction(actionId, requestId, owner)).ok, false); assert.equal(calls, 0);
});

test("an explicit open sends complete source/target provenance once and preserves its confirmed receipt after view disposal", async () => {
  const scope = context(); let finish!: (value: Response) => void; let calls = 0;
  const port = createDesignerCatalogPort(scope, async (path, init) => {
    calls++; assert.equal(path, "/api/designer/resources/open-action"); assert.equal(init?.signal, undefined);
    assert.deepEqual(JSON.parse(String(init?.body)), { actionId, requestId, sourceOwner: owner, catalogContext: scope });
    return new Promise<Response>((resolve) => { finish = resolve; });
  });
  const pending = port.openResourceAction(actionId, requestId, owner); port.dispose();
  finish(Response.json(success(scope))); assert.deepEqual(await pending, success(scope)); assert.equal(calls, 1);
});

test("export failures keep LOCAL_PERSIST and unknown facts without replay or CLI/catalog fallback", async () => {
  const failure = { ok: false, code: "LOCAL_PERSIST", error: "Binding changed after export", retryable: false,
    projectDirectory: directory, localPersistence: "confirmed", persistedParts: { localProject: true, binding: true } };
  let calls = 0; const port = createDesignerCatalogPort(context(), async () => { calls++; return Response.json(failure, { status: 409 }); });
  assert.deepEqual(await port.openResourceAction(actionId, requestId, owner), failure); assert.equal(calls, 1);
  let networkCalls = 0; const lost = createDesignerCatalogPort(context(), async () => { networkCalls++; throw Error("connection lost"); });
  const result = await lost.openResourceAction(actionId, requestId, owner);
  assert.equal(result.ok, false); assert.equal(result.localPersistence, "unknown"); assert.equal(networkCalls, 1);
});

test("a malformed receipt or a destination with different full binding is never presented as a file to open", async () => {
  const scope = context();
  for (const override of [{ path: "../other/data.json" }, { projectDirectory: ".quicker/actions/.." }, { actionId: "bad" },
    { projectBinding: { ...scope.expectedProjectBinding!, actionId, hostBinding: { ...scope.expectedProjectBinding!.hostBinding, quickerVersion: "changed" } } }]) {
    const port = createDesignerCatalogPort(scope, async () => Response.json({ ...success(scope), ...override }));
    const result = await port.openResourceAction(actionId, requestId, owner);
    assert.equal(result.ok, false); assert.equal(result.localPersistence, "unknown");
  }
});
