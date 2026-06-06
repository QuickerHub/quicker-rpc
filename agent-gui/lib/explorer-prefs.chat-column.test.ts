import assert from "node:assert/strict";
import { test } from "node:test";
import {
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
