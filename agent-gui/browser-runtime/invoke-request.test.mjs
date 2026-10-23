import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { handleBrowserInvokeRequest } from "./invoke-request.mjs";
import { BrowserOperationQueue, createBrowserOperationOwner } from "./operation-owner.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function request() {
  const req = Object.assign(new EventEmitter(), { complete: false, aborted: false });
  const res = Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false });
  const writes = [];
  const send = (_res, status, body) => { writes.push({ status, body }); res.writableEnded = true; };
  return { req, res, writes, send,
    body(value) { req.emit("data", JSON.stringify(value)); req.complete = true; req.emit("end"); },
  };
}

test("normal complete request close does not cancel the operation; result and listeners are preserved", async () => {
  const fixture = request(); const started = deferred(); const result = deferred(); let signal;
  const pending = handleBrowserInvokeRequest(fixture.req, fixture.res, async (op, args, id, options) => {
    assert.equal(op, "page.evaluate"); assert.deepEqual(args, { script: "1" }); assert.equal(id, "one");
    signal = options.abortSignal; started.resolve(); return result.promise;
  }, fixture.send);
  fixture.body({ op: "page.evaluate", args: { script: "1" }, sessionId: "one" });
  await started.promise; fixture.req.emit("close"); assert.equal(signal.aborted, false);
  result.resolve({ ok: true, data: { value: "fixture" } }); await pending;
  fixture.res.emit("close"); assert.equal(signal.aborted, false);
  assert.deepEqual(fixture.writes, [{ status: 200, body: { ok: true, data: { value: "fixture" } } }]);
  assert.equal(fixture.req.listenerCount("aborted"), 0); assert.equal(fixture.res.listenerCount("close"), 0);
});

test("response disconnect aborts only its request, drops late writes, and retains the native session tail", async () => {
  const queue = new BrowserOperationQueue(); const native = deferred(); const started = deferred();
  let firstSignal; let nativeCalls = 0;
  const invoke = (_op, _args, id, options) => queue.run(id, createBrowserOperationOwner(options.abortSignal), async () => {
    if (id === "one") { nativeCalls++; firstSignal = options.abortSignal; started.resolve(); await native.promise; }
    return { ok: true };
  });
  const one = request(); const first = handleBrowserInvokeRequest(one.req, one.res, invoke, one.send);
  one.body({ op: "page.evaluate", sessionId: "one" }); await started.promise;
  one.res.destroyed = true; one.res.emit("close"); await first;
  assert.equal(firstSignal.aborted, true); assert.deepEqual(one.writes, []);
  assert.equal(queue.pendingSessionCount, 1);
  const two = request(); const second = handleBrowserInvokeRequest(two.req, two.res, invoke, two.send);
  two.body({ op: "page.evaluate", sessionId: "two" }); await second;
  assert.equal(two.writes[0].status, 200); assert.equal(nativeCalls, 1);
  native.resolve(); await new Promise((done) => setImmediate(done));
  assert.equal(queue.pendingSessionCount, 0); assert.deepEqual(one.writes, []);
});

test("aborted body and invalid JSON never dispatch and remove body listeners", async () => {
  const fixture = request(); const pending = handleBrowserInvokeRequest(fixture.req, fixture.res,
    () => assert.fail("No invoke for an abandoned body"), fixture.send);
  fixture.req.emit("data", "{"); fixture.req.aborted = true; fixture.req.emit("aborted"); await pending;
  assert.deepEqual(fixture.writes, []);
  for (const event of ["data", "end", "error", "aborted"]) assert.equal(fixture.req.listenerCount(event), 0);
  const invalid = request(); const invalidPending = handleBrowserInvokeRequest(invalid.req, invalid.res,
    () => assert.fail("No invoke for invalid JSON"), invalid.send);
  invalid.req.emit("data", "{"); invalid.req.emit("end"); await invalidPending;
  assert.equal(invalid.writes[0].status, 400);
});
