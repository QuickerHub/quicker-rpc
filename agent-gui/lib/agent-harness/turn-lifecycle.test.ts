import assert from "node:assert/strict";
import test from "node:test";
import { createAgentTurnLifecycle, withAgentTurnCancellation } from "./turn-lifecycle";

test("parent cancellation stops only its turn and disposes resources once", async () => {
  const parent = new AbortController();
  const first = createAgentTurnLifecycle({ abortSignal: parent.signal });
  const second = createAgentTurnLifecycle();
  let disposed = 0;
  await first.defer(() => { disposed += 1; });
  const reason = new DOMException("User stopped", "AbortError");
  parent.abort(reason);
  await Promise.all([first.dispose(), first.dispose()]);
  assert.equal(first.signal.reason, reason);
  assert.equal(second.signal.aborted, false);
  assert.equal(disposed, 1);
  await second.dispose();
});

test("late resources are disposed after cancellation during preparation", async () => {
  const lifecycle = createAgentTurnLifecycle();
  lifecycle.abort();
  await lifecycle.dispose();
  let released = false;
  await lifecycle.defer(() => { released = true; });
  assert.equal(released, true);
});

test("cleanup failure does not mask the turn outcome or skip another resource", async () => {
  const errors: unknown[] = [];
  const lifecycle = createAgentTurnLifecycle({ onCleanupError: (error) => errors.push(error) });
  const order: number[] = [];
  await lifecycle.defer(() => { order.push(1); });
  await lifecycle.defer(() => { order.push(2); throw new Error("close failed"); });
  await lifecycle.defer(() => { order.push(3); });
  await lifecycle.dispose();
  assert.deepEqual(order, [3, 2, 1]);
  assert.equal(errors.length, 1);
  assert.equal(lifecycle.signal.aborted, false);
});

test("finished turn removes its parent cancellation listener", async () => {
  const parent = new AbortController();
  const lifecycle = createAgentTurnLifecycle({ abortSignal: parent.signal });
  await lifecycle.dispose();
  parent.abort();
  assert.equal(lifecycle.signal.aborted, false);
});

test("already cancelled parent prevents new execution", async () => {
  const parent = new AbortController();
  parent.abort();
  const lifecycle = createAgentTurnLifecycle({ abortSignal: parent.signal });
  assert.throws(() => lifecycle.signal.throwIfAborted(), { name: "AbortError" });
  await lifecycle.dispose();
});

test("response body cancellation aborts the producer and releases its reader", async () => {
  const lifecycle = createAgentTurnLifecycle();
  let cancelled: unknown;
  let disposed = 0;
  await lifecycle.defer(() => { disposed += 1; });
  const source = new ReadableStream<string>({ cancel(reason) { cancelled = reason; } });
  const response = withAgentTurnCancellation(source, lifecycle);
  const reader = response.getReader();
  const pendingRead = reader.read();
  await reader.cancel("consumer disconnected");
  assert.deepEqual(await pendingRead, { done: true, value: undefined });
  assert.equal(lifecycle.signal.aborted, true);
  assert.equal(cancelled, "consumer disconnected");
  assert.equal(source.locked, false);
  assert.equal(disposed, 1);
});

test("parent abort interrupts a stalled response read", async () => {
  const parent = new AbortController();
  const lifecycle = createAgentTurnLifecycle({ abortSignal: parent.signal });
  let cancelled = false;
  const source = new ReadableStream<string>({ cancel() { cancelled = true; } });
  const reader = withAgentTurnCancellation(source, lifecycle).getReader();
  const pendingRead = reader.read();
  const reason = new DOMException("Stopped", "AbortError");
  parent.abort(reason);
  await assert.rejects(pendingRead, (error) => error === reason);
  await lifecycle.dispose();
  assert.equal(cancelled, true);
  assert.equal(source.locked, false);
});

test("normal completion preserves chunks and disposes without aborting", async () => {
  const lifecycle = createAgentTurnLifecycle();
  let disposed = 0;
  await lifecycle.defer(() => { disposed += 1; });
  const source = new ReadableStream<string>({ start(controller) {
    controller.enqueue("one"); controller.enqueue("two"); controller.close();
  } });
  const reader = withAgentTurnCancellation(source, lifecycle).getReader();
  assert.deepEqual(await reader.read(), { done: false, value: "one" });
  assert.deepEqual(await reader.read(), { done: false, value: "two" });
  assert.deepEqual(await reader.read(), { done: true, value: undefined });
  assert.equal(lifecycle.signal.aborted, false);
  assert.equal(source.locked, false);
  assert.equal(disposed, 1);
});

test("producer failure preserves the original error and cancels the turn", async () => {
  const lifecycle = createAgentTurnLifecycle();
  const failure = new Error("provider failed");
  const source = new ReadableStream<string>({ start(controller) { controller.error(failure); } });
  const reader = withAgentTurnCancellation(source, lifecycle).getReader();
  await assert.rejects(reader.read(), (error) => error === failure);
  await lifecycle.dispose();
  assert.equal(lifecycle.signal.reason, failure);
  assert.equal(source.locked, false);
});
