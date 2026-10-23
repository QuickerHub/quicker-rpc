import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import test from "node:test";
import { createStartBrowserRuntimeHandler } from "./browser-runtime-start.server";
import { createStartTerminalRuntimeHandler } from "./terminal-runtime-start.server";

test("disabled runtime handlers return standard responses without loading lifecycle modules", async () => {
  const loadLifecycle = async (): Promise<never> => { throw new Error("must not load a runtime"); };
  const handlers = [
    createStartBrowserRuntimeHandler({ env: { AGENT_GUI_SKIP_BROWSER_RUNTIME: "1" }, loadLifecycle }),
    createStartTerminalRuntimeHandler({ env: { AGENT_GUI_SKIP_TERMINAL_RUNTIME: "1" }, loadLifecycle }),
  ];
  for (const handler of handlers) {
    const response = await handler();
    assert.equal(response.constructor, Response);
    assert.equal(response.status, 503);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    assert.equal((await response.json()).ok, false);
  }
});

test("browser health reuse does not start a child", async () => {
  const handler = createStartBrowserRuntimeHandler({ env: { HOSTNAME: " 127.0.0.1 " }, loadLifecycle: async () => ({
    resolveBrowserPort: () => 45121,
    checkBrowserRuntimeHealth: async (base) => { assert.equal(base, "http://127.0.0.1:45121"); return true; },
    ensureBrowserRuntime: async () => { throw new Error("unexpected child"); },
  }) });
  const response = await handler();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, reused: true, base: "http://127.0.0.1:45121" });
});

test("browser startup preserves its existing started response and cwd", async () => {
  let checks = 0;
  const handler = createStartBrowserRuntimeHandler({ env: {}, cwd: () => "/fixture/workspace", loadLifecycle: async () => ({
    resolveBrowserPort: () => 45121,
    checkBrowserRuntimeHealth: async () => { checks += 1; return false; },
    ensureBrowserRuntime: async (cwd, host) => {
      assert.equal(cwd, "/fixture/workspace");
      assert.equal(host, "127.0.0.1");
      return { pid: 101 } as ChildProcess;
    },
  }) });
  assert.deepEqual(await (await handler()).json(), { ok: true, started: true, base: "http://127.0.0.1:45121" });
  assert.equal(checks, 1);
});

test("browser missing child and failed health remain a 503", async () => {
  let checks = 0;
  const handler = createStartBrowserRuntimeHandler({ env: {}, loadLifecycle: async () => ({
    resolveBrowserPort: () => 45121,
    checkBrowserRuntimeHealth: async () => { checks += 1; return false; },
    ensureBrowserRuntime: async () => null,
  }) });
  const response = await handler();
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /browser runtime not ready/);
  assert.equal(checks, 2);
});

test("terminal startup reports existing and newly started owners after its health check", async () => {
  for (const child of [null, { pid: 102 } as ChildProcess]) {
    const calls: string[] = [];
    const handler = createStartTerminalRuntimeHandler({ env: {}, cwd: () => "/fixture/workspace", loadLifecycle: async () => ({
      resolveTerminalPort: () => 45122,
      ensureTerminalRuntime: async (cwd, host) => {
        calls.push("ensure");
        assert.equal(cwd, "/fixture/workspace");
        assert.equal(host, "127.0.0.1");
        return child;
      },
      checkTerminalRuntimeHealth: async (base) => { calls.push("health"); assert.equal(base, "http://127.0.0.1:45122"); return true; },
    }) });
    const response = await handler();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, reused: !child, started: Boolean(child), base: "http://127.0.0.1:45122", port: 45122 });
    assert.deepEqual(calls, ["ensure", "health"]);
  }
});

test("terminal unhealthy runtime remains a 503 and adapter exceptions propagate", async () => {
  const handler = createStartTerminalRuntimeHandler({ env: {}, loadLifecycle: async () => ({
    resolveTerminalPort: () => 45122,
    ensureTerminalRuntime: async () => null,
    checkTerminalRuntimeHealth: async () => false,
  }) });
  const response = await handler();
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /terminal runtime not ready/);
  const failure = new Error("synthetic adapter failure");
  for (const createHandler of [createStartBrowserRuntimeHandler, createStartTerminalRuntimeHandler]) {
    await assert.rejects(createHandler({ env: {}, loadLifecycle: async () => { throw failure; } })(), (error) => error === failure);
  }
});
