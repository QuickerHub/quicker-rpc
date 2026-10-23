import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureTerminalRuntime, resetTerminalRuntimeWarmupForTests, resolveTerminalWebSocketUrl } from "./terminal-runtime-client";
import { runtimeHttpOrigin } from "./runtime-http-origin.mjs";
import { createStartBrowserRuntimeHandler } from "./browser-runtime-start.server";
import { createStartTerminalRuntimeHandler } from "./terminal-runtime-start.server";

test("terminal renderer discovers its service endpoint before probing or connecting to another profile", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { hostname: "127.0.0.1", protocol: "http:" } } });
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    calls.push(String(input));
    assert.equal(input, "/api/terminal/runtime");
    return Response.json({ ok: true, base: "http://[::1]:43210", port: 43210, runtimeOwner: "service-owner" });
  });
  try {
    resetTerminalRuntimeWarmupForTests();
    assert.equal((await ensureTerminalRuntime()).port, 43210);
    assert.equal(resolveTerminalWebSocketUrl(), "ws://[::1]:43210/v1/terminal/ws");
    assert.deepEqual(calls, ["/api/terminal/runtime"]);
  } finally {
    resetTerminalRuntimeWarmupForTests();
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("IPv6 runtime adapters return valid bracketed URLs and pass the raw listener host", async () => {
  assert.equal(runtimeHttpOrigin("::1", 43210), "http://[::1]:43210");
  const browser = createStartBrowserRuntimeHandler({ env: { HOSTNAME: "::1" }, loadLifecycle: async () => ({
    resolveBrowserPort: () => 43210,
    checkBrowserRuntimeHealth: async (base) => { assert.equal(new URL(base).hostname, "[::1]"); return true; },
    ensureBrowserRuntime: async () => null,
  }) });
  const terminal = createStartTerminalRuntimeHandler({ env: { HOSTNAME: "::1" }, loadLifecycle: async () => ({
    resolveTerminalPort: () => 43211,
    checkTerminalRuntimeHealth: async (base) => { assert.equal(new URL(base).hostname, "[::1]"); return true; },
    ensureTerminalRuntime: async (_cwd, host) => { assert.equal(host, "::1"); return null; },
  }) });
  assert.equal((await (await browser()).json()).base, "http://[::1]:43210");
  assert.equal((await (await terminal()).json()).base, "http://[::1]:43211");
});
