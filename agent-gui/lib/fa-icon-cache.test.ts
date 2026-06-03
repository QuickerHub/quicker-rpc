import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ensureFaIconsResolved,
  getFaIconFromCache,
  subscribeFaIconCache,
} from "./fa-icon-cache";

test("ensureFaIconsResolved coalesces duplicate specs in one batch", async () => {
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
