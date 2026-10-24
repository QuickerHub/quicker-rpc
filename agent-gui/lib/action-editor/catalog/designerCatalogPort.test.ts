import assert from "node:assert/strict";
import { test } from "node:test";
import type { ActionProjectBinding } from "../../action-project-binding";
import { createDesignerCatalogPort } from "./designerCatalogPort";
import type { DesignerCatalogContext } from "./designerCatalogContext";
import {
  designerHostGrpcGetGlobalSubProgramIo, designerHostGrpcGetSharedSubProgramIo,
  designerHostGrpcPostStepQuickInsertSearchJson, designerHostGrpcPostToolboxSearchJson,
  designerHostGrpcPostStepRunnersSummariesJson, fetchStepRunnerDetailItem,
} from "../shared/designerHostGrpcApi";
import { fetchStepRunnersItems } from "../steps/stepRunnerCatalog";
import { fetchGlobalSubProgramCatalog } from "../subprograms/globalSubProgramCatalog";
import { StepRunnerItem } from "../types/action_query";

const binding = (id: string): ActionProjectBinding => ({ schemaVersion: 1, kind: "action",
  actionId: "11111111-1111-4111-8111-111111111111", hostBinding: {
    hostInstanceId: id, hostSessionId: id.repeat(32), endpoint: `QuickerRpc_User_${"A".repeat(24)}_${id.repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: { read: true },
  } });
const context = (id: string): DesignerCatalogContext => ({ cwd: "C:/fixture", projectDirectory: `.quicker/actions/${id}`, expectedProjectBinding: binding(id) });
const runner = (id: string) => StepRunnerItem.fromPartial({ key: "sys:catalog-fixture", name: id, icon: "fixture-icon",
  inputParamDefs: [{ key: id, name: id, varType: 0 }], outputParamDefs: [] });
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

test("resource call insertion requires a live bound V1 runtime subprogram catalog and grants no operation by itself", () => {
  let requests = 0;
  const fetcher: typeof fetch = async () => { requests++; throw Error("Eligibility is not a schema or body read"); };
  const valid = context("a"); valid.expectedProjectBinding!.hostBinding.capabilities["resource.globalSubprogram.page.read"] = true;
  const port = createDesignerCatalogPort(valid, fetcher); assert.equal(port.resourceCallInsertAvailable, true);
  port.dispose(); assert.equal(port.resourceCallInsertAvailable, false);
  for (const scope of [undefined, null, context("a"), { ...valid, expectedProjectBinding: null },
    { ...valid, expectedProjectBinding: { ...valid.expectedProjectBinding!, hostBinding: { ...valid.expectedProjectBinding!.hostBinding, hostKind: "v2" as const } } }])
    assert.equal(createDesignerCatalogPort(scope, fetcher).resourceCallInsertAvailable, false);
  assert.equal(requests, 0);
});

test("all catalog ports send the exact document target and adjacent schemas/caches stay isolated", async () => {
  const requests: Array<{ path: string; body: any; method?: string }> = [];
  const fetcher: typeof fetch = async (path, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push({ path: String(path), body, method: init?.method });
    const id = body.catalogContext.expectedProjectBinding.hostBinding.hostInstanceId;
    return json({ ok: true, item: runner(id), items: String(path).endsWith("/list") ? [runner(id)] : [], json: '{"items":[]}' });
  };
  const a = createDesignerCatalogPort(context("a"), fetcher), b = createDesignerCatalogPort(context("b"), fetcher);
  const [first, second] = await Promise.all([fetchStepRunnerDetailItem("sys:catalog-fixture", undefined, undefined, a), fetchStepRunnerDetailItem("sys:catalog-fixture", undefined, undefined, b)]);
  assert.equal(first?.inputParamDefs[0]?.key, "a");
  assert.equal(second?.inputParamDefs[0]?.key, "b");
  await fetchStepRunnerDetailItem("sys:catalog-fixture", undefined, undefined, a);
  assert.equal(requests.length, 3, "the next read revalidates against the same bound host");
  assert.equal(a.get("details"), undefined);
  assert.equal(b.get("details"), undefined);
  await fetchStepRunnersItems("", { catalogPort: a });
  await designerHostGrpcPostStepRunnersSummariesJson("", '{"steps":[]}', undefined, a);
  await designerHostGrpcPostStepQuickInsertSearchJson("", '{}', undefined, a);
  await designerHostGrpcPostToolboxSearchJson("", '{}', undefined, a);
  await designerHostGrpcGetGlobalSubProgramIo("", { subProgramId: "global" }, undefined, a);
  await designerHostGrpcGetSharedSubProgramIo("", { identifier: "shared" }, undefined, a);
  await fetchGlobalSubProgramCatalog(undefined, a);
  assert.equal(new Set(requests.map((request) => request.path)).size, 7);
  for (const request of requests) {
    assert.equal(request.method, "POST");
    assert.deepEqual(request.body.catalogContext, request.body.catalogContext.projectDirectory.endsWith("/b") ? context("b") : context("a"));
  }
  a.dispose(); b.dispose();
});

test("one waiter cancellation does not abort another; last cancellation and disposal reject promptly and ignore late replies", async () => {
  const response = deferred<Response>(); let calls = 0; let requestSignal: AbortSignal | null | undefined;
  const port = createDesignerCatalogPort(context("a"), async (_path, init) => { calls += 1; requestSignal = init?.signal; return response.promise; });
  const cancel = new AbortController();
  const first = fetchStepRunnerDetailItem("sys:catalog-fixture", undefined, cancel.signal, port);
  const next = fetchStepRunnerDetailItem("sys:catalog-fixture", undefined, undefined, port);
  await new Promise((done) => setImmediate(done));
  cancel.abort(new Error("first only"));
  await assert.rejects(first, /first only/);
  assert.equal(requestSignal?.aborted, false);
  response.resolve(json({ ok: true, item: runner("a") }));
  assert.equal((await next)?.name, "a");
  assert.equal(calls, 1);

  const lastReply = deferred<Response>();
  let lastSignal: AbortSignal | null | undefined;
  const lastOwner = createDesignerCatalogPort(context("b"), async (_path, init) => { lastSignal = init?.signal; return lastReply.promise; });
  const lastCancel = new AbortController();
  const last = fetchStepRunnerDetailItem("sys:catalog-fixture", undefined, lastCancel.signal, lastOwner);
  await new Promise((done) => setImmediate(done));
  lastCancel.abort(new Error("last waiter"));
  await assert.rejects(last, /last waiter/);
  assert.equal(lastSignal?.aborted, true);
  lastReply.resolve(json({ ok: true, item: runner("discarded") }));
  await new Promise((done) => setImmediate(done));
  assert.equal(lastOwner.get("details"), undefined);
  lastOwner.dispose();

  const lateResponse = deferred<Response>();
  const old = createDesignerCatalogPort(context("a"), async () => lateResponse.promise);
  const late = fetchStepRunnerDetailItem("sys:catalog-fixture", undefined, undefined, old);
  await new Promise((done) => setImmediate(done));
  old.dispose();
  await assert.rejects(late, { name: "AbortError" });
  lateResponse.resolve(json({ ok: true, item: runner("old") }));
  await new Promise((done) => setImmediate(done));
  assert.equal(old.get("details"), undefined);
  port.dispose();
});

test("loading and unbound documents make zero catalog requests; identity failures are not retried as legacy or aliases", async () => {
  let requests = 0;
  const noFetch: typeof fetch = async () => { requests += 1; throw new Error("unexpected remote request"); };
  for (const scope of [null, { ...context("a"), expectedProjectBinding: null }]) {
    const port = createDesignerCatalogPort(scope, noFetch);
    assert.deepEqual(await fetchStepRunnersItems("", { catalogPort: port }), []);
    assert.equal(await fetchStepRunnerDetailItem("sys:unregistered-fixture", undefined, undefined, port), null);
    assert.equal(await fetchStepRunnerDetailItem("sys:subprogram", undefined, undefined, port), null, "the current empty essential set never triggers discovery");
    await designerHostGrpcPostStepRunnersSummariesJson("", '{}', undefined, port);
    await designerHostGrpcPostStepQuickInsertSearchJson("", '{}', undefined, port);
    await designerHostGrpcPostToolboxSearchJson("", '{}', undefined, port);
    await designerHostGrpcGetGlobalSubProgramIo("", { subProgramId: "fixture" }, undefined, port);
    await designerHostGrpcGetSharedSubProgramIo("", { identifier: "fixture" }, undefined, port);
    assert.deepEqual(await fetchGlobalSubProgramCatalog(undefined, port), []);
    port.dispose();
  }
  assert.equal(requests, 0);
  const port = createDesignerCatalogPort(context("a"), async () => { requests += 1; return new Response(JSON.stringify({ ok: false, code: "PROJECT_IDENTITY_CONFLICT", error: "Changed target" }), { status: 409 }); });
  await assert.rejects(fetchStepRunnerDetailItem("sys:subprogram", undefined, undefined, port), { code: "PROJECT_IDENTITY_CONFLICT" });
  assert.equal(requests, 1);
  assert.equal(port.get("details"), undefined);
  port.dispose();
});
