import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { SessionManager } from "./session-manager.mjs";
import { createEmbeddedBrowserAutomation } from "../electron/embedded-browser/automation-engine.mjs";

const flush = () => new Promise((done) => setImmediate(done));
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function headlessFixture() {
  const manager = new SessionManager({ headless: true, channel: null, userDataDir: "unused-generated-fixture" });
  const calls = [];
  const makeSession = (id) => {
    const page = {
      isClosed: () => false, url: () => "https://fixture.invalid/", title: async () => { calls.push(`${id}:title`); return "fixture"; },
      evaluate: async () => { calls.push(`${id}:evaluate`); return 1; },
      getByRole: () => ({ click: async () => calls.push(`${id}:click`) }),
    };
    const context = { close: async () => calls.push(`${id}:close`), pages: () => [page] };
    const session = { sessionId: id, page, context, refMap: { e1: { role: "button", name: "go", nth: 0 } } };
    manager._sessions.set(id, session); return session;
  };
  manager._scheduleStorageStateSave = () => calls.push("storage-save");
  return { manager, calls, a: makeSession("a"), b: makeSession("b") };
}

test("headless pre-abort and queued cancel dispatch nothing; running evaluate keeps its owner until native settles", async () => {
  const { manager, calls, a } = headlessFixture(); const native = deferred(); const started = deferred();
  a.page.evaluate = () => { calls.push("a:native"); started.resolve(); return native.promise; };
  const pre = new AbortController(); const preReason = new Error("pre"); pre.abort(preReason);
  await assert.rejects(manager.invoke("session.ensure", {}, "missing", { abortSignal: pre.signal }), (e) => e === preReason);
  assert.deepEqual(calls, []);
  const abort = new AbortController(); const reason = new Error("running");
  const pending = manager.invoke("page.evaluate", { script: "1" }, "a", { abortSignal: abort.signal });
  const rejected = assert.rejects(pending, (e) => e === reason); await started.promise;
  const queuedAbort = new AbortController(); const queuedReason = new Error("queued");
  const queued = manager.invoke("page.click", { ref: "e1" }, "a", { abortSignal: queuedAbort.signal });
  const queuedRejected = assert.rejects(queued, (e) => e === queuedReason);
  const next = manager.invoke("session.ensure", {}, "a");
  abort.abort(reason); queuedAbort.abort(queuedReason); await Promise.all([rejected, queuedRejected]);
  assert.deepEqual(calls, ["a:native"]); assert.equal(manager._operations.pendingSessionCount, 1);
  assert.equal((await manager.invoke("page.evaluate", { script: "1" }, "b")).ok, true);
  native.resolve(2); await next; await flush();
  assert.deepEqual(calls, ["a:native", "b:evaluate", "b:title", "a:title"]);
  assert.equal(manager._operations.pendingSessionCount, 0); assert.equal(a.refMap.e1.name, "go");
});

test("headless late click failure is not softened, retried, settled, persisted or used to close a shared context", async () => {
  const { manager, calls, a } = headlessFixture(); const native = deferred(); const started = deferred();
  a.page.getByRole = () => ({ click: () => { calls.push("click"); started.resolve(); return native.promise; } });
  manager._settleAfterAction = () => assert.fail("No settle after cancelled click");
  const abort = new AbortController(); const reason = new Error("cancel click");
  const pending = manager.invoke("page.click", { ref: "e1" }, "a", { abortSignal: abort.signal });
  const rejected = assert.rejects(pending, (e) => e === reason); await started.promise;
  abort.abort(reason); await rejected; native.reject(new Error("native late failure")); await flush();
  assert.deepEqual(calls, ["click"]); assert.equal(a.refMap.e1.name, "go");
  assert.equal(manager._sessions.get("a"), a); assert.equal(manager._operations.pendingSessionCount, 0);
});

test("headless snapshot checks its owner at the refMap commit even when abort races the awaited wrapper's continuation", async () => {
  const { manager, a } = headlessFixture(); const title = deferred(); const started = deferred();
  const original = a.refMap; a.page.evaluate = async () => [{ role: "button", name: "late" }];
  a.page.title = () => { started.resolve(); return title.promise; };
  const abort = new AbortController(); const reason = new Error("commit window");
  const pending = manager.invoke("page.snapshot", { includePreview: false }, "a", { abortSignal: abort.signal });
  const rejected = assert.rejects(pending, (error) => error === reason); await started.promise;
  // This reaction runs after owner.wait's native continuation, before the caller commits shared state.
  void title.promise.then(() => abort.abort(reason)); title.resolve("fixture");
  await rejected; await flush(); assert.equal(a.refMap, original);
});

test("headless cancellation during navigation wait never dispatches timeout fallback or evaluate", async () => {
  const { manager, calls, a } = headlessFixture(); const native = deferred(); const started = deferred();
  a.page.goto = async () => { calls.push("goto"); };
  a.page.waitForLoadState = () => { started.resolve(); return native.promise; };
  a.page.waitForTimeout = () => assert.fail("No cancelled navigation fallback");
  const abort = new AbortController(); const reason = new Error("cancel wait");
  const pending = manager.invoke("page.evaluate", { script: "1", url: "https://fixture.invalid/new" }, "a", { abortSignal: abort.signal });
  const rejected = assert.rejects(pending, (e) => e === reason); await started.promise;
  abort.abort(reason); await rejected; native.reject(new Error("load failed")); await flush();
  assert.deepEqual(calls, ["goto"]); assert.equal(a.refMap.e1.name, "go");
});

test("headless cancelled new context is disposed before publication without retrying or touching shared contexts", async () => {
  const fixtureParent = resolve(dirname(fileURLToPath(import.meta.url)), "../.tmp");
  mkdirSync(fixtureParent, { recursive: true }); const fixtureRoot = mkdtempSync(join(fixtureParent, "browser-owner-"));
  try {
    const manager = new SessionManager({ headless: true, channel: null, userDataDir: fixtureRoot });
    const native = deferred(); const started = deferred(); let attempts = 0; let closes = 0; let newPages = 0;
    manager._ensureBrowser = async () => {};
    manager._browser = { newContext: () => { attempts++; started.resolve(); return native.promise; } };
    const context = { close: async () => { closes++; }, newPage: () => { newPages++; } };
    const abort = new AbortController(); const reason = new Error("cancel create");
    const pending = manager.invoke("session.ensure", {}, "new", { abortSignal: abort.signal });
    const rejected = assert.rejects(pending, (e) => e === reason); await started.promise;
    abort.abort(reason); await rejected; native.resolve(context); await flush();
    assert.equal(attempts, 1); assert.equal(closes, 1); assert.equal(newPages, 0);
    assert.equal(manager.sessionCount, 0); assert.equal(manager._operations.pendingSessionCount, 0);
  } finally {
    assert.equal(dirname(resolve(fixtureRoot)), fixtureParent);
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function embeddedFixture() {
  const calls = []; const webContents = new Map();
  for (const id of ["a", "b"]) {
    const wc = Object.assign(new EventEmitter(), {
      isDestroyed: () => false, getURL: () => "https://fixture.invalid/", getTitle: () => { calls.push(`${id}:title`); return "fixture"; },
      executeJavaScript: async () => { calls.push(`${id}:execute`); return 1; },
      isLoading: () => false, capturePage: () => assert.fail("No preview after cancellation"),
    }); webContents.set(id, wc);
  }
  const manager = { getWebContents: (id) => webContents.get(id),
    ensureOffscreen: () => calls.push("ensure"), close: () => calls.push("close"),
    isMounted: () => false, readNavigationState: () => ({ url: "", title: "" }) };
  return { automation: createEmbeddedBrowserAutomation(manager), calls, a: webContents.get("a"), b: webContents.get("b") };
}

test("embedded native evaluate holds the session queue after cancel; parallel owner survives and no late metadata/preview runs", async () => {
  const { automation, calls, a } = embeddedFixture(); const native = deferred(); const started = deferred();
  a.executeJavaScript = () => { calls.push("a:native"); started.resolve(); return native.promise; };
  const abort = new AbortController(); const reason = new Error("embedded cancel");
  const pending = automation.invoke("page.evaluate", { script: "1" }, "a", { abortSignal: abort.signal });
  const rejected = assert.rejects(pending, (e) => e === reason); await started.promise;
  const next = automation.invoke("session.ensure", {}, "a"); abort.abort(reason); await rejected;
  assert.deepEqual(calls, ["a:native"]);
  assert.equal((await automation.invoke("page.evaluate", { script: "2" }, "b")).ok, true);
  assert.deepEqual(calls, ["a:native", "b:execute", "b:title"]);
  native.resolve(3); await next;
  assert.deepEqual(calls, ["a:native", "b:execute", "b:title", "ensure", "a:title"]);
});

test("embedded snapshot never publishes refs when cancellation lands between native wait and shared commit", async () => {
  const { automation, a } = embeddedFixture();
  a.executeJavaScript = async () => [{ role: "button", name: "original" }];
  const initial = await automation.invoke("page.snapshot", { includePreview: false }, "a");
  const ref = initial.data.snapshot.match(/ref=(e\d+)/)?.[1]; assert.ok(ref);
  const native = deferred(); const started = deferred();
  a.executeJavaScript = () => { started.resolve(); return native.promise; };
  const abort = new AbortController(); const reason = new Error("embedded commit window");
  const pending = automation.invoke("page.snapshot", { includePreview: false }, "a", { abortSignal: abort.signal });
  const rejected = assert.rejects(pending, (error) => error === reason); await started.promise;
  void native.promise.then(() => abort.abort(reason)); native.resolve([{ role: "button", name: "late" }]);
  await rejected; await flush();
  let clickScript;
  a.executeJavaScript = async (script) => { clickScript = script; return true; };
  const clicked = await automation.invoke("page.click", { ref, includePreview: false }, "a");
  assert.equal(clicked.ok, true); assert.match(clickScript, /"name":"original"/);
  assert.doesNotMatch(clickScript, /"name":"late"/);
});

test("embedded pre-abort never ensures a native view and cancelled click does not settle, preview, retry or close", async () => {
  const { automation, calls, a } = embeddedFixture(); const pre = new AbortController(); const reason = new Error("pre"); pre.abort(reason);
  await assert.rejects(automation.invoke("session.ensure", {}, "a", { abortSignal: pre.signal }), (e) => e === reason);
  assert.deepEqual(calls, []);
  // A genuine snapshot establishes the same refMap subsequently consumed by click.
  a.executeJavaScript = async () => [{ role: "button", name: "go" }];
  const snap = await automation.invoke("page.snapshot", { includePreview: false }, "a"); assert.equal(snap.ok, true);
  const ref = snap.data.snapshot.match(/ref=(e\d+)/)?.[1]; assert.ok(ref); calls.length = 0;
  const native = deferred(); const started = deferred();
  a.executeJavaScript = () => { calls.push("click"); started.resolve(); return native.promise; };
  a.isLoading = () => assert.fail("No settle after cancelled click");
  const abort = new AbortController(); const clickReason = new Error("click cancelled");
  const pending = automation.invoke("page.click", { ref }, "a", { abortSignal: abort.signal });
  const rejected = assert.rejects(pending, (e) => e === clickReason); await started.promise;
  abort.abort(clickReason); await rejected; native.reject(new Error("native rejected")); await flush();
  assert.deepEqual(calls, ["click"]);
});

test("embedded navigation abort removes event listeners but waits for its own loadURL before dispatching the next request", async () => {
  const { automation, calls, a } = embeddedFixture(); const native = deferred(); const started = deferred();
  a.loadURL = () => { calls.push("load"); started.resolve(); return native.promise; };
  const abort = new AbortController(); const reason = new Error("navigation cancelled");
  const pending = automation.invoke("page.evaluate", { script: "1", url: "https://fixture.invalid/new" }, "a", { abortSignal: abort.signal });
  const rejected = assert.rejects(pending, (e) => e === reason); await started.promise;
  const next = automation.invoke("session.ensure", {}, "a"); abort.abort(reason); await rejected;
  assert.equal(a.listenerCount("did-finish-load"), 0); assert.equal(a.listenerCount("did-fail-load"), 0);
  assert.deepEqual(calls, ["load"]); native.resolve(); await next;
  assert.deepEqual(calls, ["load", "ensure", "a:title"]);
});

test("embedded navigation deadline rejects promptly but does not release its native queue tail", async () => {
  const { automation, calls, a } = embeddedFixture(); const native = deferred(); const started = deferred();
  a.loadURL = () => { calls.push("load"); started.resolve(); return native.promise; };
  const pending = automation.invoke("page.navigate", { url: "https://fixture.invalid/new", timeoutMs: 10 }, "a");
  const rejected = assert.rejects(pending, /navigation timeout after 10ms/); await started.promise;
  const next = automation.invoke("session.ensure", {}, "a"); await rejected;
  assert.equal(a.listenerCount("did-finish-load"), 0); assert.equal(a.listenerCount("did-fail-load"), 0);
  assert.deepEqual(calls, ["load"]); native.resolve(); await next;
  assert.deepEqual(calls, ["load", "ensure", "a:title"]);
});

test("headless and embedded normal click still complete after owned waits", async () => {
  const { manager, calls, a } = headlessFixture();
  a.page.waitForLoadState = async () => {};
  const clicked = await manager.invoke("page.click", { ref: "e1", includePreview: false }, "a");
  assert.equal(clicked.ok, true); assert.equal(clicked.data.clicked, true);
  assert.deepEqual(calls, ["a:click", "storage-save", "a:title"]);
  const embedded = embeddedFixture();
  embedded.a.executeJavaScript = async () => [{ role: "button", name: "go" }];
  const snap = await embedded.automation.invoke("page.snapshot", { includePreview: false }, "a");
  const ref = snap.data.snapshot.match(/ref=(e\d+)/)?.[1]; assert.ok(ref);
  embedded.a.executeJavaScript = async () => true;
  const embeddedClick = await embedded.automation.invoke("page.click", { ref, includePreview: false }, "a");
  assert.equal(embeddedClick.ok, true); assert.equal(embeddedClick.data.clicked, true);
});
