import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldActivateMsgTurnSticky } from "./use-msg-turn-sticky-active.ts";

test("shouldActivateMsgTurnSticky is false when messages fit without scroll", () => {
  assert.equal(shouldActivateMsgTurnSticky(500, 551, 400, 80), false);
});

test("shouldActivateMsgTurnSticky is false when turn is short despite thread scroll", () => {
  assert.equal(shouldActivateMsgTurnSticky(1200, 551, 280, 80), false);
});

test("shouldActivateMsgTurnSticky is true for tall turn in scrollable thread", () => {
  assert.equal(shouldActivateMsgTurnSticky(2000, 551, 900, 80), true);
});

test("shouldActivateMsgTurnSticky stays active with hysteresis when height dips slightly", () => {
  assert.equal(shouldActivateMsgTurnSticky(2000, 551, 490, 80, true), true);
  assert.equal(shouldActivateMsgTurnSticky(2000, 551, 490, 80, false), false);
});
