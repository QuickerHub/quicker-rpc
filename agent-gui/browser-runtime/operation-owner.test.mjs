import assert from "node:assert/strict";
import { test } from "node:test";
import { BrowserOperationQueue, createBrowserOperationOwner } from "./operation-owner.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((done) => setImmediate(done));

test("pre-aborted operation never joins a queue or dispatches", () => {
  const queue = new BrowserOperationQueue(); const abort = new AbortController();
  const reason = new Error("fixture pre-abort"); abort.abort(reason);
  assert.throws(() => queue.run("session", createBrowserOperationOwner(abort.signal), () => assert.fail("No dispatch")), (error) => error === reason);
  assert.equal(queue.pendingSessionCount, 0);
});

test("cancelled native work keeps its session tail; queued cancellation skips dispatch and another session proceeds", async () => {
  const queue = new BrowserOperationQueue(); const firstAbort = new AbortController(); const queuedAbort = new AbortController();
  const native = deferred(); const started = deferred(); const calls = [];
  const reason = new Error("fixture running cancelled"); const queuedReason = new Error("fixture queued cancelled");
  const first = queue.run("shared", createBrowserOperationOwner(firstAbort.signal), async (owner) => {
    calls.push("native"); started.resolve(); await native.promise; owner.checkpoint(); calls.push("late session commit");
  });
  const firstRejected = assert.rejects(first, (error) => error === reason);
  await started.promise;
  const queued = queue.run("shared", createBrowserOperationOwner(queuedAbort.signal), () => calls.push("cancelled queue entry"));
  const queuedRejected = assert.rejects(queued, (error) => error === queuedReason);
  const next = queue.run("shared", createBrowserOperationOwner(), () => calls.push("next"));
  firstAbort.abort(reason); queuedAbort.abort(queuedReason);
  await Promise.all([firstRejected, queuedRejected]);
  assert.deepEqual(calls, ["native"]);
  await queue.run("other", createBrowserOperationOwner(), () => calls.push("other"));
  assert.deepEqual(calls, ["native", "other"]);
  native.resolve(); await next; await flush();
  assert.deepEqual(calls, ["native", "other", "next"]);
  assert.equal(queue.pendingSessionCount, 0);
});

test("late native failure is observed without retrying, and only a pending owner can affect its queue", async () => {
  const queue = new BrowserOperationQueue(); const abort = new AbortController(); const native = deferred();
  const started = deferred(); const reason = new Error("fixture abandoned"); let attempts = 0;
  const pending = queue.run("shared", createBrowserOperationOwner(abort.signal), () => { attempts++; started.resolve(); return native.promise; });
  const rejected = assert.rejects(pending, (error) => error === reason);
  await started.promise; abort.abort(reason); await rejected;
  native.reject(new Error("fixture native late error")); await flush();
  assert.equal(attempts, 1);
  const other = new AbortController();
  assert.equal(await queue.run("shared", createBrowserOperationOwner(other.signal), async () => "new owner"), "new owner");
  assert.equal(other.signal.aborted, false);
  await flush(); assert.equal(queue.pendingSessionCount, 0);
});
