import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import test from "node:test";
import { createStartBrowserRuntimeHandler } from "./browser-runtime-start.server";
import { createStartTerminalRuntimeHandler } from "./terminal-runtime-start.server";
import { checkBrowserRuntimeHealth, ensureBrowserRuntime } from "./browser-runtime-lifecycle.mjs";
import { checkTerminalRuntimeHealth, ensureTerminalRuntime } from "@/lib/terminal-runtime-lifecycle.mjs";
import { POST as browserPost } from "../app/api/browser/runtime/route";
import { POST as legacyBrowserPost } from "../app/api/dev/browser-runtime/route";
import { GET as terminalGet, POST as terminalPost } from "../app/api/terminal/runtime/route";

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

test("pre-canceled runtime requests allocate no lifecycle module or health probe", async () => {
  const abort = new AbortController(), reason = Error("pre-canceled fixture");
  abort.abort(reason);
  const req = new Request("http://fixture.invalid/runtime", { signal: abort.signal });
  for (const createHandler of [createStartBrowserRuntimeHandler, createStartTerminalRuntimeHandler]) {
    const handler = createHandler({ loadLifecycle: async () => { throw Error("unexpected load"); } });
    await assert.rejects(handler(req), (error) => error === reason);
  }
});

test("all runtime HTTP routes preserve pre-cancellation, including terminal HEAD through GET", async () => {
  const abort = new AbortController(), reason = Error("route pre-canceled");
  abort.abort(reason);
  for (const handler of [browserPost, legacyBrowserPost, terminalGet, terminalPost]) {
    const request = new Request("http://fixture.invalid/runtime", { method: handler === terminalGet ? "HEAD" : "POST", signal: abort.signal });
    await assert.rejects(handler(request), (error) => error === reason);
  }
});

test("cancellation during lazy module loading prevents health probes or child startup", async () => {
  for (const createHandler of [createStartBrowserRuntimeHandler, createStartTerminalRuntimeHandler]) {
    const abort = new AbortController(), reason = Error("module load canceled");
    const handler = createHandler({ loadLifecycle: async () => { abort.abort(reason); return {} as never; } });
    await assert.rejects(handler(new Request("http://fixture.invalid/runtime", { signal: abort.signal })), (error) => error === reason);
  }
});

test("browser health and terminal startup cannot publish late success or start follow-up work after cancel", async () => {
  const abort = new AbortController(), reason = Error("canceled late health");
  const browser = createStartBrowserRuntimeHandler({ env: {}, loadLifecycle: async () => ({
    resolveBrowserPort: () => 45121,
    checkBrowserRuntimeHealth: async (_base, _timeout, signal) => {
      assert.equal(signal, request.signal); abort.abort(reason); return true;
    },
    ensureBrowserRuntime: async () => { throw Error("unexpected child startup"); },
  }) });
  const request = new Request("http://fixture.invalid/runtime", { signal: abort.signal });
  await assert.rejects(browser(request), (error) => error === reason);
  const terminalAbort = new AbortController();
  const terminalRequest = new Request("http://fixture.invalid/runtime", { signal: terminalAbort.signal });
  const terminal = createStartTerminalRuntimeHandler({ env: {}, loadLifecycle: async () => ({
    resolveTerminalPort: () => 45122,
    ensureTerminalRuntime: async (_cwd, _host, signal) => {
      assert.equal(signal, terminalRequest.signal); terminalAbort.abort(reason); return { pid: 1 } as ChildProcess;
    },
    checkTerminalRuntimeHealth: async () => { throw Error("unexpected follow-up probe"); },
  }) });
  await assert.rejects(terminal(terminalRequest), (error) => error === reason);
});

for (const [kind, checkHealth, ensure] of [
  ["browser", checkBrowserRuntimeHealth, ensureBrowserRuntime],
  ["terminal", checkTerminalRuntimeHealth, ensureTerminalRuntime],
] as const) {
  test(`${kind} releases a rejected health response body before returning unavailable`, async (t) => {
    let canceled = 0;
    t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("unfinished rejected body")); },
      cancel() { canceled++; },
    }), { status: 503 }));
    assert.equal(await checkHealth("http://fixture.invalid"), false);
    assert.equal(canceled, 1);
  });

  test(`${kind} health cancellation releases its timeout without canceling another observer`, async (t) => {
    const first = new AbortController(), second = new AbortController(), signals: AbortSignal[] = [];
    const reason = Error("first observer canceled");
    let release!: (response: Response) => void;
    t.mock.method(globalThis, "fetch", async (_input, options) => {
      const signal = options?.signal as AbortSignal;
      signals.push(signal);
      if (signals.length === 2) return new Promise<Response>((done) => { release = done; });
      return new Promise<Response>((_done, fail) => { signal.addEventListener("abort", () => fail(signal.reason), { once: true }); });
    });
    const a = checkHealth("http://fixture.invalid", 30_000, first.signal);
    const b = checkHealth("http://fixture.invalid", 30_000, second.signal);
    first.abort(reason);
    await assert.rejects(a, (error) => error === reason);
    assert.equal(signals[1].aborted, false);
    release(Response.json({ ok: true }));
    assert.equal(await b, true);
    const pre = new AbortController(); pre.abort(reason);
    await assert.rejects(ensure("/absent-fixture", "127.0.0.1", pre.signal), (error) => error === reason);
    assert.equal(signals.length, 2, "pre-cancel cannot probe, read runtime paths or spawn a child");
  });

  test(`${kind} ignores a response body settling after its health observer is canceled`, async (t) => {
    const abort = new AbortController(), reason = Error("late health body");
    let entered!: () => void, release!: (body: unknown) => void;
    const reading = new Promise<void>((done) => { entered = done; });
    t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: () => { entered(); return new Promise((done) => { release = done; }); } }) as Response);
    const pending = checkHealth("http://fixture.invalid", 30_000, abort.signal);
    await reading; abort.abort(reason); release({ ok: true });
    await assert.rejects(pending, (error) => error === reason);
  });
}

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
