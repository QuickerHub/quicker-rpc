import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchBrowserRuntimeHealth, isBrowserRuntimeVersionCurrent } from "./browser-runtime-lifecycle.mjs";
import { ensureBrowserRuntimeReady } from "./browser-runtime-client.server";

test("browser tool readiness rejects an equally versioned runtime owned by another profile", async (t) => {
  const previous = process.env.QUICKER_AGENT_RUNTIME_OWNER;
  process.env.QUICKER_AGENT_RUNTIME_OWNER = "current-service";
  let invokes = 0;
  t.mock.method(globalThis, "fetch", async (input) => {
    assert.match(String(input), /\/health$/);
    invokes++;
    return Response.json({ ok: true, runtimeVersion: "0.4.0", runtimeOwner: "another-service" });
  });
  try {
    const health = await fetchBrowserRuntimeHealth("http://fixture.test");
    assert.equal(isBrowserRuntimeVersionCurrent(health), false);
    await assert.rejects(ensureBrowserRuntimeReady(), /another owner|incompatible runtime/);
    assert.ok(invokes > 0);
  } finally {
    if (previous === undefined) delete process.env.QUICKER_AGENT_RUNTIME_OWNER;
    else process.env.QUICKER_AGENT_RUNTIME_OWNER = previous;
  }
});
