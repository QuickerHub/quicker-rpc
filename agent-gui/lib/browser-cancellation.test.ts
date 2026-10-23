import assert from "node:assert/strict";
import { test } from "node:test";
import { BROWSER_TOOL_DEF, executeBrowserTool } from "./browser-tool.server";
import { createBrowserRuntimeReadiness, invokeBrowserRuntime } from "./browser-runtime-client.server";
import { invokeEmbeddedBrowserRuntime, resetEmbeddedBrowserRuntimeAvailabilityCache } from "./embedded-browser-runtime-client.server";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";
import { clearBrowserRecordings, getBrowserRecordings } from "./browser-to-action/recording";
import { RUNTIME_VERSION } from "../browser-runtime/config.mjs";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const runtimeOwner = "browser-cancellation-fixture";
function health(url: string): Response {
  return Response.json({ ok: true, runtimeOwner, runtimeVersion: RUNTIME_VERSION,
    protocolVersion: url.includes(":6018/") ? "quicker-embedded-browser-v1" : "quicker-browser-v1" });
}

async function withTransport(fetch: typeof globalThis.fetch, run: () => Promise<void>, native = false) {
  const original = globalThis.fetch;
  const overrides = { BROWSER_AUTOMATION_MODE: native ? "native" : "playwright", QUICKER_AGENT_RUNTIME_OWNER: runtimeOwner,
    QUICKER_BROWSER_HOST: "127.0.0.1", QUICKER_BROWSER_PORT: "6017",
    QUICKER_EMBEDDED_BROWSER_HOST: "127.0.0.1", QUICKER_EMBEDDED_BROWSER_PORT: "6018" };
  const before = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
  globalThis.fetch = fetch;
  Object.assign(process.env, overrides);
  resetEmbeddedBrowserRuntimeAvailabilityCache();
  try { await run(); }
  finally {
    globalThis.fetch = original;
    for (const [key, value] of before) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    resetEmbeddedBrowserRuntimeAvailabilityCache();
  }
}

test("SDK explicit cancellation and ALS cancellation reject the original reason before any probe, session or operation", async () => {
  let requests = 0;
  await withTransport(async () => { requests += 1; throw new Error("Unexpected fixture transport"); }, async () => {
    const cancel = new AbortController();
    const reason = new Error("fixture pre-abort"); cancel.abort(reason);
    await assert.rejects(Promise.resolve(BROWSER_TOOL_DEF.execute!({ action: "navigate" },
      { abortSignal: cancel.signal, toolCallId: "fixture", messages: [] })), (error) => error === reason);
    await assert.rejects(invokeBrowserRuntime("page.navigate", {}, "fixture", 1000, { abortSignal: cancel.signal }), (error) => error === reason);
    await assert.rejects(invokeEmbeddedBrowserRuntime("page.navigate", {}, "fixture", 1000, { abortSignal: cancel.signal }), (error) => error === reason);
    const explicit = new AbortController();
    await assert.rejects(runWithAgentRequestContextAsync({ abortSignal: cancel.signal }, () =>
      executeBrowserTool({ action: "navigate" }, { abortSignal: explicit.signal })), (error) => error === reason);
    assert.equal(explicit.signal.aborted, false);
    assert.equal(requests, 0);
  });
});

test("a cancelled shared-readiness waiter leaves the other caller and shared startup alive", async () => withTransport(async () => { throw new Error("No HTTP needed"); }, async () => {
  const started = deferred<void>();
  const release = deferred<void>();
  let ready = false;
  let starts = 0;
  const wait = createBrowserRuntimeReadiness({
    health: async () => ({ ok: ready, runtimeVersion: RUNTIME_VERSION, runtimeOwner }),
    start: async () => { starts += 1; started.resolve(); await release.promise; ready = true; },
  });
  const a = new AbortController(); const b = new AbortController();
  const reason = new Error("fixture waiter left");
  const first = wait(a.signal);
  const rejected = assert.rejects(first, (error) => error === reason);
  await started.promise;
  const second = wait(b.signal);
  a.abort(reason);
  await rejected;
  assert.equal(b.signal.aborted, false);
  release.resolve();
  await second;
  assert.equal(starts, 1);
}));

test("in-flight cancellation aborts only its HTTP connection; a parallel session succeeds without session.close", async () => {
  const dispatched = deferred<void>();
  const releaseOther = deferred<Response>();
  const calls: Array<{ op: string; sessionId: string; signal: AbortSignal }> = [];
  await withTransport(async (input, init) => {
    if (String(input).endsWith("/health")) return health(String(input));
    const body = JSON.parse(String(init?.body));
    const signal = init!.signal!;
    calls.push({ ...body, signal });
    if (body.sessionId === "fixture-a") {
      dispatched.resolve();
      return new Promise<Response>((_done, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    }
    return releaseOther.promise;
  }, async () => {
    const a = new AbortController(); const b = new AbortController();
    const reason = new Error("fixture stop A");
    const first = runWithAgentRequestContextAsync({ abortSignal: a.signal }, () => invokeBrowserRuntime("page.evaluate", {}, "fixture-a"));
    const rejected = assert.rejects(first, (error) => error === reason);
    await dispatched.promise;
    const second = runWithAgentRequestContextAsync({ abortSignal: b.signal }, () => invokeBrowserRuntime("page.evaluate", {}, "fixture-b"));
    a.abort(reason);
    await rejected;
    releaseOther.resolve(Response.json({ ok: true, data: { value: "other owner" } }));
    assert.equal((await second).ok, true);
    assert.equal(calls.find((call) => call.sessionId === "fixture-a")?.signal.aborted, true);
    assert.equal(calls.find((call) => call.sessionId === "fixture-b")?.signal.aborted, false);
    assert.equal(calls.some((call) => call.op === "session.close"), false);
  });
});

test("cancelled native navigation rejects instead of deferred success or headless fallback, including late HTTP success", async () => {
  const invoked = deferred<void>(); const late = deferred<Response>();
  const calls: string[] = [];
  const session = "fixture-native-late";
  clearBrowserRecordings(session);
  await withTransport(async (input, init) => {
    const url = String(input); calls.push(url);
    if (url.endsWith("/health")) return health(url);
    assert.equal(JSON.parse(String(init?.body)).op, "page.navigate");
    assert.ok(url.includes(":6018/"));
    invoked.resolve();
    return late.promise; // Deliberately ignores signal to exercise a late transport completion.
  }, async () => {
    const cancel = new AbortController(); const reason = new Error("fixture native cancelled");
    const pending = executeBrowserTool({ action: "navigate", target: "embedded", sessionId: session, url: "https://fixture.invalid/" }, { abortSignal: cancel.signal });
    const rejected = assert.rejects(pending, (error) => error === reason);
    await invoked.promise; cancel.abort(reason); await rejected;
    late.resolve(Response.json({ ok: true, data: { title: "late success" } }));
    await new Promise<void>((done) => setImmediate(done));
    assert.equal(calls.some((url) => url.includes(":6017/")), false);
    assert.deepEqual(getBrowserRecordings(session), []);
  }, true);
});

test("cancellation during JSON body consumption rejects late success without adding a recording", async () => {
  const reading = deferred<void>(); const body = deferred<unknown>();
  const session = "fixture-body-late";
  clearBrowserRecordings(session);
  await withTransport(async (input) => {
    if (String(input).endsWith("/health")) return health(String(input));
    return { json: () => { reading.resolve(); return body.promise; } } as Response;
  }, async () => {
    const cancel = new AbortController(); const reason = new Error("fixture body cancelled");
    const pending = executeBrowserTool({ action: "evaluate", target: "headless", sessionId: session, url: "https://fixture.invalid/", script: "1" }, { abortSignal: cancel.signal });
    const rejected = assert.rejects(pending, (error) => error === reason);
    await reading.promise; cancel.abort(reason); await rejected;
    body.resolve({ ok: true, data: { value: "late body" } });
    await new Promise<void>((done) => setImmediate(done));
    assert.deepEqual(getBrowserRecordings(session), []);
  });
});

test("cancellation during session.ensure prevents the queued page operation", async () => {
  const cancel = new AbortController(); const reason = new Error("fixture after ensure");
  const calls: string[] = [];
  await withTransport(async (input, init) => {
    if (String(input).endsWith("/health")) return health(String(input));
    calls.push(JSON.parse(String(init?.body)).op);
    return { json: async () => { queueMicrotask(() => cancel.abort(reason)); return { ok: true }; } } as Response;
  }, async () => {
    await assert.rejects(executeBrowserTool({ action: "snapshot", target: "headless", sessionId: "fixture-queued" }, { abortSignal: cancel.signal }), (error) => error === reason);
    assert.deepEqual(calls, ["session.ensure"]);
  });
});

test("cancelling the embedded availability probe does not dispatch another probe or headless fallback", async () => {
  const probed = deferred<void>(); const late = deferred<Response>();
  let requests = 0;
  await withTransport(async () => { requests += 1; probed.resolve(); return late.promise; }, async () => {
    const cancel = new AbortController(); const reason = new Error("fixture probe cancelled");
    const pending = executeBrowserTool({ action: "status", target: "embedded" }, { abortSignal: cancel.signal });
    const rejected = assert.rejects(pending, (error) => error === reason);
    await probed.promise; cancel.abort(reason); await rejected;
    late.resolve(health("http://fixture:6018/health"));
    await new Promise<void>((done) => setImmediate(done));
    assert.equal(requests, 1);
  }, true);
});
