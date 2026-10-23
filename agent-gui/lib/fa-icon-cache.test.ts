import assert from "node:assert/strict";
import { test } from "node:test";

test("global FA persistence is lazy on import, then retains the existing cache format and batching", async () => {
  let reads = 0, writes = 0, fetches = 0;
  const saved = { spec: "fa:Light_Saved", enumName: "Light_Saved", path: "saved", width: 31, height: 17, color: "#123456" };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { get localStorage() {
    reads++; return { getItem: (key: string) => { assert.equal(key, "agent-gui:fa-icon-cache:v1"); return JSON.stringify([saved]); },
      setItem: () => { writes++; } };
  } } });
  globalThis.fetch = async (_path, init) => { fetches++; assert.equal(String(_path), "/api/fa/resolve");
    assert.deepEqual(JSON.parse(String(init?.body)), { specs: ["fa:Light_New"] });
    return Response.json({ ok: true, items: [{ ...saved, spec: "fa:Light_New", path: "new" }] }); };
  try {
    const cache = await import("./fa-icon-cache");
    assert.equal(reads, 0, "a scoped consumer importing the module must not read global persistence");
    assert.deepEqual(cache.getFaIconFromCache(saved.spec), saved);
    const initialReads = reads;
    cache.getFaIconCacheSnapshot(); cache.getFaIconFromCache(saved.spec); assert.equal(reads, initialReads);
    const unsubscribe = cache.subscribeFaIconCache(() => {});
    cache.ensureFaIconsResolved([saved.spec, "fa:Light_New", "fa:Light_New"]); await cache.flushFaIconCache();
    assert.equal(fetches, 1); assert.equal(cache.getFaIconFromCache("fa:Light_New")?.path, "new");
    unsubscribe(); assert.equal(writes, 0, "the existing deferred persistence remains deferred");
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    globalThis.fetch = previousFetch;
  }
});

test("ensureFaIconsResolved coalesces duplicate specs in one batch", async () => {
  const { ensureFaIconsResolved, getFaIconFromCache, subscribeFaIconCache } = await import("./fa-icon-cache");
  const spec = "fa:Light_Test_Cache";
  const geometry = {
    spec,
    enumName: "Test",
    path: "M0 0",
    width: 512,
    height: 512,
  };

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async (input, init) => {
    fetchCount += 1;
    const body = JSON.parse(String(init?.body)) as { specs: string[] };
    assert.deepEqual(body.specs, [spec]);
    return new Response(JSON.stringify({ ok: true, items: [geometry] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    let notified = 0;
    const unsub = subscribeFaIconCache(() => {
      notified += 1;
    });

    ensureFaIconsResolved([spec, spec]);
    ensureFaIconsResolved([spec]);

    await new Promise((r) => setTimeout(r, 50));

    assert.equal(fetchCount, 1);
    assert.equal(getFaIconFromCache(spec)?.path, "M0 0");
    assert.ok(notified >= 1);
    unsub();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
