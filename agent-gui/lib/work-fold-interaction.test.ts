import assert from "node:assert/strict";
import test from "node:test";
import { nextWorkFoldFollowing, resolveWorkFoldOpen, workFoldFollowingOnTailIntent } from "./work-fold-interaction";

const metrics = (distance: number) => ({
  scrollHeight: 1200,
  clientHeight: 300,
  scrollTop: 900 - distance,
});

test("unclaimed work follows live and completed defaults", () => {
  assert.equal(resolveWorkFoldOpen(false, null), false);
  assert.equal(resolveWorkFoldOpen(true, null), true);
  assert.equal(resolveWorkFoldOpen(false, null), false);
});

test("explicitly opened work stays readable when streaming ends or a reply arrives", () => {
  const userOpen = true;
  assert.equal(resolveWorkFoldOpen(true, userOpen), true);
  assert.equal(resolveWorkFoldOpen(false, userOpen), true);
});

test("explicitly collapsed work stays collapsed through the next running tool", () => {
  const userOpen = false;
  assert.equal(resolveWorkFoldOpen(false, userOpen), false);
  assert.equal(resolveWorkFoldOpen(true, userOpen), false);
  assert.equal(resolveWorkFoldOpen(false, userOpen), false);
});

test("reading just above the tail pauses follow before another streaming chunk", () => {
  let following = true;
  following = nextWorkFoldFollowing(following, metrics(8));
  assert.equal(following, true);
  following = nextWorkFoldFollowing(following, metrics(9));
  assert.equal(following, false);
  following = nextWorkFoldFollowing(following, metrics(200));
  assert.equal(following, false);
});

test("a paused reader resumes at the V2 enter threshold and supports overscroll", () => {
  let following = false;
  following = nextWorkFoldFollowing(following, metrics(65), metrics(80), true);
  assert.equal(following, false);
  following = nextWorkFoldFollowing(following, metrics(64), metrics(65), true);
  assert.equal(following, true);
  assert.equal(nextWorkFoldFollowing(following, metrics(-2)), true);
});

test("a small upward scroll stays paused through repeated samples at the same position", () => {
  let following = nextWorkFoldFollowing(true, metrics(40), metrics(0));
  assert.equal(following, false);
  for (let i = 0; i < 4; i++) {
    following = nextWorkFoldFollowing(following, metrics(40), metrics(40));
    assert.equal(following, false);
  }
});

test("layout changes cannot resume a paused reader or consume an earlier downward intent", () => {
  const before = metrics(40);
  const anchored = { ...before, scrollHeight: before.scrollHeight + 100, scrollTop: before.scrollTop + 100 };
  assert.equal(nextWorkFoldFollowing(false, anchored, before, true), false);
  assert.equal(nextWorkFoldFollowing(false, { ...before, clientHeight: before.clientHeight + 20 }, before), false);
  assert.equal(nextWorkFoldFollowing(false, metrics(30), metrics(40)), false);
});

test("reaching the actual bottom resumes scrollbar and touch scrolling without wheel intent", () => {
  assert.equal(nextWorkFoldFollowing(false, metrics(0), metrics(40)), true);
  assert.equal(nextWorkFoldFollowing(false, metrics(0), metrics(0)), false);
});

test("explicit End or downward wheel at an already reached tail resumes without a scroll event", () => {
  assert.equal(workFoldFollowingOnTailIntent(false, metrics(0)), true);
  assert.equal(workFoldFollowingOnTailIntent(false, metrics(0.5)), true);
  assert.equal(workFoldFollowingOnTailIntent(false, metrics(40)), false);
  assert.equal(nextWorkFoldFollowing(false, metrics(0), metrics(0)), false);
});
