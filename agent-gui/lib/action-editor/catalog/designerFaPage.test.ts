import assert from "node:assert/strict";
import { test } from "node:test";
import { createDesignerCatalogPort } from "./designerCatalogPort";
import { fetchDesignerFaPage, normalizeDesignerFaPageQuery, readDesignerFaPage } from "./designerFaPage";
import type { DesignerCatalogContext } from "./designerCatalogContext";

const scope = (name: string): DesignerCatalogContext => ({ cwd: "C:/fixture", projectDirectory: `.quicker/actions/${name}`,
  expectedProjectBinding: { schemaVersion: 1, kind: "action", actionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", hostBinding: {
    hostInstanceId: name, hostSessionId: name.repeat(32), endpoint: `QuickerRpc_User_${"C".repeat(24)}_${name.repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: "v1", capabilities: {}, quickerVersion: name,
  } } });
const query = normalizeDesignerFaPageQuery({ query: "camera", style: "Light", skip: 2, take: 2 });
const page = { ...query, names: ["Light_Camera", "Light_CameraAlt"], totalCount: 5, hasMore: true };
const tick = () => new Promise<void>((done) => setImmediate(done));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

test("native paging normalization preserves unknown styles and rejects non-Int32 criteria", () => {
  assert.deepEqual(normalizeDesignerFaPageQuery({ query: "  相机  ", style: " bRaNd ", skip: -3, take: 0 }), { query: "相机", style: "Brands", skip: 0, take: 96 });
  assert.deepEqual(normalizeDesignerFaPageQuery({ style: " Future ", take: 1000 }), { query: "", style: "Future", skip: 0, take: 300 });
  assert.deepEqual(normalizeDesignerFaPageQuery({ query: null, style: null }), { query: "", style: null, skip: 0, take: 96 });
  for (const value of [null, [], { query: 1 }, { style: false }, { skip: null }, { take: "96" }, { skip: 1.5 }, { take: Infinity }, { skip: 2147483648 }])
    assert.throws(() => normalizeDesignerFaPageQuery(value), { code: "INVALID_FA_PAGE_REQUEST" });
});

test("all seven page facts are checked, including exhausted pages and foreign criteria", () => {
  assert.deepEqual(readDesignerFaPage(page, query), page);
  assert.ok(Object.isFrozen(readDesignerFaPage(page, query).names));
  const exhausted = normalizeDesignerFaPageQuery({ skip: 20 });
  assert.deepEqual(readDesignerFaPage({ ...exhausted, names: [], totalCount: 5, hasMore: false }, exhausted).names, []);
  for (const change of [{ names: [] }, { names: ["", "Light_Camera"] }, { names: ["a", 1] }, { query: "other" }, { style: null },
    { skip: 3 }, { take: 3 }, { totalCount: 3 }, { totalCount: -1 }, { totalCount: 1.5 }, { hasMore: false }, { hasMore: "true" }])
    assert.throws(() => readDesignerFaPage({ ...page, ...change }, query), { code: "INVALID_FA_PAGE_RESPONSE" });
});

test("missing/loading/unbound/legacy owners and preabort make zero requests", async () => {
  let calls = 0;
  for (const context of [undefined, null, { ...scope("a"), expectedProjectBinding: null }]) {
    const port = createDesignerCatalogPort(context, async () => { calls++; throw new Error("Unexpected fetch"); });
    await assert.rejects(fetchDesignerFaPage(port, query), { code: "HOST_BINDING_REQUIRED" }); port.dispose();
  }
  await assert.rejects(fetchDesignerFaPage(undefined, query), { code: "HOST_BINDING_REQUIRED" });
  const abort = new AbortController(), reason = new Error("already cancelled"); abort.abort(reason);
  await assert.rejects(fetchDesignerFaPage(undefined, query, abort.signal), (error) => error === reason);
  assert.equal(calls, 0);
});

test("equal GUIDs in separate owners share no pages; one waiter cancellation leaves the other alive", async () => {
  let calls = 0; const response = deferred<Response>(); let signal: AbortSignal | null | undefined;
  const port = createDesignerCatalogPort(scope("a"), async (_path, init) => {
    calls++; signal = init?.signal; assert.deepEqual(JSON.parse(String(init?.body)).catalogContext, scope("a")); return response.promise;
  });
  const abort = new AbortController();
  const first = fetchDesignerFaPage(port, query, abort.signal), second = fetchDesignerFaPage(port, query);
  await tick(); abort.abort(new Error("only first")); await assert.rejects(first, /only first/); assert.equal(signal?.aborted, false);
  response.resolve(Response.json({ ok: true, ...page })); assert.deepEqual(await second, page);
  await fetchDesignerFaPage(port, query); assert.equal(calls, 1);
  const other = createDesignerCatalogPort(scope("b"), async (_path, init) => {
    calls++; assert.deepEqual(JSON.parse(String(init?.body)).catalogContext, scope("b")); return Response.json({ ok: true, ...page, names: ["b", "b2"] });
  });
  assert.deepEqual((await fetchDesignerFaPage(other, query)).names, ["b", "b2"]); assert.equal(calls, 2);
  port.dispose(); other.dispose();
});

test("last waiter cancellation and dispose reject late success without reviving a cached slot", async () => {
  for (const dispose of [false, true]) {
    const response = deferred<Response>(); let signal: AbortSignal | null | undefined; let calls = 0;
    const port = createDesignerCatalogPort(scope("a"), async (_path, init) => {
      calls++; signal = init?.signal; return calls === 1 ? response.promise : Response.json({ ok: true, ...page });
    });
    const abort = new AbortController(); const pending = fetchDesignerFaPage(port, query, abort.signal);
    await tick(); if (dispose) port.dispose(); else abort.abort(new Error("last waiter"));
    await assert.rejects(pending); assert.equal(signal?.aborted, true);
    response.resolve(Response.json({ ok: true, ...page })); await tick();
    if (dispose) await assert.rejects(fetchDesignerFaPage(port, query), { code: "STALE_CATALOG_OWNER" });
    else { await fetchDesignerFaPage(port, query); assert.equal(calls, 2, "late result must not fill the cache"); }
    port.dispose();
  }
});

test("page failures preserve structured unsupported and the shared result cache is bounded LRU", async () => {
  const port = createDesignerCatalogPort(scope("a"), async () => Response.json({ ok: false, code: "UNSUPPORTED_HOST", error: "page unavailable" }, { status: 503 }));
  await assert.rejects(fetchDesignerFaPage(port, query), { code: "UNSUPPORTED_HOST" });
  port.set("old", 1); port.set("keep", 2);
  for (let i = 0; i < 254; i++) port.set(`fill-${i}`, i);
  assert.equal(port.get("keep"), 2); port.set("new", 3);
  assert.equal(port.get("old"), undefined); assert.equal(port.get("keep"), 2);
  port.dispose(); port.set("revive", 4); assert.equal(port.get("revive"), undefined);
});
