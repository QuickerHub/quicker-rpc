import assert from "node:assert/strict";
import { test } from "node:test";
import { argvToInvoke } from "../../qkrpc-argv";
import { isQkrpcReadOnlyInvoke } from "../../qkrpc-host-binding";
import { getQkrpcOperationEffects, isQkrpcInvokeReplaySafe } from "../../qkrpc-operation-effects";
import { createDesignerCatalogPort } from "./designerCatalogPort";
import { appendDesignerResourcePage, fetchDesignerResourcePage, normalizeDesignerResourceQuery, readDesignerResourcePage, RESOURCE_PAGE_CAPABILITIES } from "./designerResourcePage";
import type { DesignerCatalogContext } from "./designerCatalogContext";

const query = normalizeDesignerResourceQuery({ kind: "action", take: 2 });
const item = (id: string) => ({ id, title: id, description: "summary", icon: "", editVersion: "9223372036854775807", actionType: null, callIdentifier: null });
const first = { ...query, items: [item("a"), item("b")], snapshotId: "snapshot-a", totalCount: 3, hasMore: true };
function context(supported = true): DesignerCatalogContext {
  return { projectDirectory: ".quicker/actions/a", expectedProjectBinding: { schemaVersion: 1, kind: "action", actionId: "fixture", hostBinding: {
    hostInstanceId: "fixture", hostSessionId: "a".repeat(32), endpoint: `QuickerRpc_User_${"A".repeat(24)}_${"a".repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: "v2", quickerVersion: "fixture", capabilities: { [RESOURCE_PAGE_CAPABILITIES.action]: supported },
  } } };
}
test("both resource CLI kinds map complete snapshot criteria to an explicit pure read invoke", () => {
  for (const [command, kind] of [["action", "action"], ["subprogram", "global_subprogram"]]) {
    const invoke = argvToInvoke([command, "catalog-page", "--query", "fixture", "--scope", "runtimeCatalog", "--skip", "2", "--take", "2", "--snapshot-id", "snapshot-a", "--no-bootstrap"]);
    assert.deepEqual(invoke, { op: "resource.catalog.page", args: { kind, scope: "runtimeCatalog", query: "fixture", skip: 2, take: 2, expectedSnapshotId: "snapshot-a" } });
    assert.equal(isQkrpcReadOnlyInvoke(invoke!), true);
    assert.equal(isQkrpcInvokeReplaySafe(invoke!), true);
    assert.deepEqual(getQkrpcOperationEffects(invoke!), { mayMutateHost: false, mayPersistLocal: false });
  }
});
test("normalization and page projection preserve exact versions and reject inconsistent snapshot facts", () => {
  assert.equal(normalizeDesignerResourceQuery({ kind: "action", query: " x ", take: 999 }).take, 500);
  for (const input of [{ kind: "unknown" }, { kind: "action", scope: "account" }, { kind: "action", skip: 1 }, { kind: "action", query: 1 }, { kind: "action", take: 0.5 }])
    assert.throws(() => normalizeDesignerResourceQuery(input));
  const page = readDesignerResourcePage(first, query);
  assert.equal(page.items[0].editVersion, "9223372036854775807"); assert.ok(Object.isFrozen(page.items));
  const nextQuery = normalizeDesignerResourceQuery({ ...query, skip: 2, expectedSnapshotId: page.snapshotId });
  const next = readDesignerResourcePage({ ...first, skip: 2, items: [item("c")], hasMore: false }, nextQuery);
  assert.deepEqual(appendDesignerResourcePage(page, next).items.map((row) => row.id), ["a", "b", "c"]);
  for (const changed of [{ snapshotId: "other" }, { query: "other" }, { kind: "global_subprogram" }, { scope: "account" }, { items: [] }, { totalCount: 4 }, { hasMore: true }])
    assert.throws(() => readDesignerResourcePage({ ...next, ...changed }, nextQuery));
  for (const changed of [{ snapshotId: "other" }, { query: "other" }, { totalCount: 4 }, { items: [item("a")] }])
    assert.throws(() => appendDesignerResourcePage(page, { ...next, ...changed }));
});
test("resource reads require per-kind bound capability, bypass persistent cache and discard cancelled owners", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json({ ok: true, ...first }); };
  const missing = createDesignerCatalogPort(undefined, fetcher), disabled = createDesignerCatalogPort(context(false), fetcher);
  await assert.rejects(fetchDesignerResourcePage(missing, query), /resolved document target/);
  await assert.rejects(fetchDesignerResourcePage(disabled, query), /does not support/);
  const port = createDesignerCatalogPort(context(), fetcher);
  await assert.rejects(fetchDesignerResourcePage(port, { kind: "global_subprogram" }), /does not support/);
  assert.equal(calls, 0, "V2 or missing capability never becomes legacy search");
  await fetchDesignerResourcePage(port, query); await fetchDesignerResourcePage(port, query);
  assert.equal(calls, 2, "refresh captures a new first page");
  let finish!: (response: Response) => void, signal: AbortSignal | null | undefined;
  const late = createDesignerCatalogPort(context(), async (_path, init) => { signal = init?.signal; return new Promise((resolve) => { finish = resolve; }); });
  const pending = fetchDesignerResourcePage(late, query);
  await new Promise((done) => setImmediate(done)); late.dispose();
  await assert.rejects(pending); assert.equal(signal?.aborted, true);
  finish(Response.json({ ok: true, ...first }));
  assert.equal(late.supportsCapability(RESOURCE_PAGE_CAPABILITIES.action), false);
  missing.dispose(); disabled.dispose(); port.dispose();
});
