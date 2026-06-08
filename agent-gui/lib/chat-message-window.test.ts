import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHAT_MESSAGE_WINDOW_DEFAULT_TURNS,
  CHAT_MESSAGE_WINDOW_STREAMING_TURNS,
  findTurnIndexForMessageIndex,
  isHotTurnIndex,
  nextExpandedTurnCount,
  resolveEffectiveTurnWindow,
  resolveVisibleMessageStart,
  resolveVisibleTurnStart,
  shouldTrimWindowAtBottom,
  turnIndicesPrepended,
} from "./chat-message-window.ts";

test("findTurnIndexForMessageIndex maps message index to turn", () => {
  const starts = [0, 3, 7];
  assert.equal(findTurnIndexForMessageIndex(starts, 0), 0);
  assert.equal(findTurnIndexForMessageIndex(starts, 2), 0);
  assert.equal(findTurnIndexForMessageIndex(starts, 3), 1);
  assert.equal(findTurnIndexForMessageIndex(starts, 9), 2);
});

test("resolveVisibleTurnStart keeps recent window", () => {
  const { startTurnIndex, hiddenTurnCount } = resolveVisibleTurnStart(20, 5);
  assert.equal(startTurnIndex, 15);
  assert.equal(hiddenTurnCount, 15);
});

test("resolveVisibleTurnStart respects min turn (edit anchor)", () => {
  const { startTurnIndex, hiddenTurnCount } = resolveVisibleTurnStart(
    20,
    5,
    2,
  );
  assert.equal(startTurnIndex, 2);
  assert.equal(hiddenTurnCount, 2);
});

test("resolveVisibleTurnStart shows all when under limit", () => {
  const { startTurnIndex, hiddenTurnCount } = resolveVisibleTurnStart(4, 12);
  assert.equal(startTurnIndex, 0);
  assert.equal(hiddenTurnCount, 0);
});

test("resolveVisibleMessageStart mirrors turn logic", () => {
  const { startMessageIndex, hiddenMessageCount } = resolveVisibleMessageStart(
    100,
    40,
    10,
  );
  assert.equal(startMessageIndex, 10);
  assert.equal(hiddenMessageCount, 10);
});

test("shouldTrimWindowAtBottom only when following stream", () => {
  assert.equal(
    shouldTrimWindowAtBottom(
      true,
      30,
      CHAT_MESSAGE_WINDOW_DEFAULT_TURNS + 4,
      CHAT_MESSAGE_WINDOW_DEFAULT_TURNS,
    ),
    true,
  );
  assert.equal(
    shouldTrimWindowAtBottom(
      false,
      30,
      CHAT_MESSAGE_WINDOW_DEFAULT_TURNS + 4,
      CHAT_MESSAGE_WINDOW_DEFAULT_TURNS,
    ),
    false,
  );
  assert.equal(
    shouldTrimWindowAtBottom(
      true,
      30,
      CHAT_MESSAGE_WINDOW_DEFAULT_TURNS + 4,
      CHAT_MESSAGE_WINDOW_DEFAULT_TURNS,
      true,
    ),
    false,
  );
});

test("nextExpandedTurnCount caps at total", () => {
  assert.equal(nextExpandedTurnCount(10, 14, 8), 14);
  assert.equal(nextExpandedTurnCount(10, 30, 8), 18);
});

test("resolveEffectiveTurnWindow caps while streaming", () => {
  assert.equal(resolveEffectiveTurnWindow(12, true), CHAT_MESSAGE_WINDOW_STREAMING_TURNS);
  assert.equal(resolveEffectiveTurnWindow(12, false), 12);
});

test("turnIndicesPrepended lists newly mounted older turns", () => {
  assert.deepEqual(turnIndicesPrepended(8, 5), [5, 6, 7]);
  assert.deepEqual(turnIndicesPrepended(3, 3), []);
  assert.deepEqual(turnIndicesPrepended(2, 5), []);
});

test("isHotTurnIndex keeps only recent turns hot", () => {
  assert.equal(isHotTurnIndex(7, 10, 2), false);
  assert.equal(isHotTurnIndex(8, 10, 2), true);
  assert.equal(isHotTurnIndex(9, 10, 2), true);
  assert.equal(isHotTurnIndex(6, 10, 3), false);
  assert.equal(isHotTurnIndex(7, 10, 3), true);
});
