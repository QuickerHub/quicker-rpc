import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adaptChatColumnWidthForContainer,
  CHAT_MAIN_MAX_WIDTH,
  clampChatColumnWidth,
  defaultChatColumnWidth,
} from "./explorer-prefs.ts";

test("defaultChatColumnWidth splits container in half", () => {
  assert.equal(defaultChatColumnWidth(800), 400);
  assert.equal(defaultChatColumnWidth(900), 450);
});

test("clampChatColumnWidth keeps side panel above minimum width", () => {
  assert.equal(clampChatColumnWidth(700, 800), 672);
  assert.equal(clampChatColumnWidth(400, 800), 400);
});

test("clampChatColumnWidth caps chat column at CHAT_MAIN_MAX_WIDTH", () => {
  assert.equal(clampChatColumnWidth(900, 1200), CHAT_MAIN_MAX_WIDTH);
});

test("adaptChatColumnWidthForContainer shrinks both columns proportionally", () => {
  assert.equal(adaptChatColumnWidthForContainer(556, 898, 700), 433);
});

test("adaptChatColumnWidthForContainer grows chat until max then favors side panel", () => {
  assert.equal(adaptChatColumnWidthForContainer(556, 898, 1200), CHAT_MAIN_MAX_WIDTH);
});

test("adaptChatColumnWidthForContainer round-trips proportional shrink and grow", () => {
  const shrunk = adaptChatColumnWidthForContainer(556, 898, 700);
  const restored = adaptChatColumnWidthForContainer(shrunk, 700, 898);
  assert.ok(Math.abs(restored - 556) <= 1);
});
