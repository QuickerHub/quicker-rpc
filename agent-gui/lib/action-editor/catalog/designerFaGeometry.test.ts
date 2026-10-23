import assert from "node:assert/strict";
import { test } from "node:test";
import { createDesignerCatalogPort } from "./designerCatalogPort";
import { readDesignerFaGeometry, resolveDesignerFaIcons } from "./designerFaGeometry";
import type { DesignerCatalogContext } from "./designerCatalogContext";

const spec = "fa:Light_Fixture:#123456";
const geometry = (path: string, value = spec) => ({ spec: value, enumName: "Light_Fixture", path, width: 37, height: 19, color: "#123456" });
const scope = (name: string): DesignerCatalogContext => ({ cwd: "C:/fixture", projectDirectory: `.quicker/actions/${name}`,
  expectedProjectBinding: { schemaVersion: 1, kind: "action", actionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", hostBinding: {
    hostInstanceId: name, hostSessionId: name.repeat(32), endpoint: `QuickerRpc_User_${"C".repeat(24)}_${name.repeat(32)}`,
    protocolVersion: 1, schemaVersion: 1, hostKind: "v1", capabilities: {}, quickerVersion: name,
  } } });
const tick = () => new Promise<void>((done) => setImmediate(done));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

test("same specs stay document-owned and scoped geometry preserves color and dimensions", async () => {
  const requests: any[] = [];
  const fetcher: typeof fetch = async (_path, init) => {
    const body = JSON.parse(String(init?.body)); requests.push(body);
    return Response.json({ ok: true, items: [geometry(body.catalogContext.expectedProjectBinding.hostBinding.hostInstanceId)], errors: [] });
  };
  const a = createDesignerCatalogPort(scope("a"), fetcher), b = createDesignerCatalogPort(scope("b"), fetcher);
  const [first, second] = await Promise.all([resolveDesignerFaIcons(a, [spec]), resolveDesignerFaIcons(b, [spec])]);
  assert.equal(first[0]?.path, "a"); assert.equal(second[0]?.path, "b");
  assert.equal(first[0]?.width, 37); assert.equal(first[0]?.height, 19); assert.equal(first[0]?.color, "#123456");
  assert.deepEqual(requests.map((request) => request.catalogContext), [scope("a"), scope("b")]);
  await resolveDesignerFaIcons(a, [spec]); assert.equal(requests.length, 2);
  a.dispose(); b.dispose();
});

test("loading, unbound and missing ports do not resolve; host failure never falls back", async () => {
  let calls = 0;
  const deny: typeof fetch = async () => { calls++; throw new Error("unexpected host"); };
  for (const context of [null, { ...scope("a"), expectedProjectBinding: null }]) {
    const port = createDesignerCatalogPort(context, deny);
    assert.deepEqual(await resolveDesignerFaIcons(port, [spec]), []); port.dispose();
  }
  assert.deepEqual(await resolveDesignerFaIcons(undefined, [spec]), []); assert.equal(calls, 0);
  const failed = createDesignerCatalogPort(scope("a"), async () => { calls++; return Response.json({ ok: false, code: "HOST_UNAVAILABLE", error: "bound host gone" }, { status: 503 }); });
  await assert.rejects(resolveDesignerFaIcons(failed, [spec]), { code: "HOST_UNAVAILABLE" });
  assert.equal(readDesignerFaGeometry(failed, spec), undefined); assert.equal(calls, 1); failed.dispose();
});

test("one waiter cancel preserves another; disposal and last cancellation prevent late cache writes", async () => {
  const reply = deferred<Response>(); let signal: AbortSignal | null | undefined; let calls = 0;
  const port = createDesignerCatalogPort(scope("a"), async (_path, init) => { calls++; signal = init?.signal; return reply.promise; });
  const cancel = new AbortController();
  const first = resolveDesignerFaIcons(port, [spec], cancel.signal), second = resolveDesignerFaIcons(port, [spec]);
  await tick(); cancel.abort(new Error("one waiter")); await assert.rejects(first, /one waiter/);
  assert.equal(signal?.aborted, false);
  reply.resolve(Response.json({ ok: true, items: [geometry("a")], errors: [] }));
  assert.equal((await second)[0]?.path, "a"); assert.equal(calls, 1); port.dispose();

  for (const dispose of [false, true]) {
    const late = deferred<Response>(); let ownedSignal: AbortSignal | null | undefined;
    const owner = createDesignerCatalogPort(scope("b"), async (_path, init) => { ownedSignal = init?.signal; return late.promise; });
    const controller = new AbortController(); const pending = resolveDesignerFaIcons(owner, [spec], controller.signal);
    await tick(); if (dispose) owner.dispose(); else controller.abort(new Error("last waiter"));
    await assert.rejects(pending); assert.equal(ownedSignal?.aborted, true);
    late.resolve(Response.json({ ok: true, items: [geometry("late")], errors: [] })); await tick();
    assert.equal(readDesignerFaGeometry(owner, spec), undefined); owner.dispose();
  }
});

test("resolve batches respect the existing 80-spec native limit and reject foreign result specs", async () => {
  const batches: string[][] = [];
  const port = createDesignerCatalogPort(scope("a"), async (_path, init) => {
    const body = JSON.parse(String(init?.body)); batches.push(body.specs);
    return Response.json({ ok: true, items: [...body.specs.map((value: string) => geometry(value, value)), geometry("foreign", spec)], errors: [] });
  });
  const specs = Array.from({ length: 81 }, (_, index) => `fa:Light_Fixture${index}`);
  const result = await resolveDesignerFaIcons(port, specs);
  assert.deepEqual(batches.map((batch) => batch.length), [80, 1]); assert.equal(result.length, 81);
  assert.equal(readDesignerFaGeometry(port, spec), undefined); port.dispose();
});
