import assert from "node:assert/strict";
import { test } from "node:test";
import { createStreamValueThrottle } from "./stream-value-throttle";

test("continuous chunks publish the latest value at the original deadline", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const published: string[] = [];
  const throttle = createStreamValueThrottle((value) => published.push(value), 120);
  throttle.enqueue("a");
  t.mock.timers.tick(40);
  throttle.enqueue("ab");
  t.mock.timers.tick(40);
  throttle.enqueue("abc");
  t.mock.timers.tick(39);
  assert.deepEqual(published, []);
  t.mock.timers.tick(1);
  assert.deepEqual(published, ["abc"]);
  throttle.enqueue("abcd");
  t.mock.timers.tick(120);
  assert.deepEqual(published, ["abc", "abcd"]);
});

test("completion or unmount cancels a pending flush and allows a fresh owner", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const published: string[] = [];
  const throttle = createStreamValueThrottle((value) => published.push(value), 120);
  throttle.enqueue("partial");
  t.mock.timers.tick(50);
  throttle.cancel();
  t.mock.timers.tick(120);
  assert.deepEqual(published, []);
  throttle.enqueue("new stream");
  t.mock.timers.tick(120);
  assert.deepEqual(published, ["new stream"]);
});
