import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWorkspaceToolAutoOpenKey,
  markWorkspaceToolAutoOpened,
  readToolCallId,
} from "./workspace-tool-auto-open";

test("markWorkspaceToolAutoOpened runs once per key", () => {
  assert.equal(markWorkspaceToolAutoOpened("call-1"), true);
  assert.equal(markWorkspaceToolAutoOpened("call-1"), false);
  assert.equal(markWorkspaceToolAutoOpened("call-2"), true);
});

test("buildWorkspaceToolAutoOpenKey prefers toolCallId", () => {
  assert.equal(
    buildWorkspaceToolAutoOpenKey("abc", "msg", 3),
    "call:abc",
  );
  assert.equal(
    buildWorkspaceToolAutoOpenKey(undefined, "msg", 3),
    "part:msg:3",
  );
});

test("readToolCallId reads tool part id", () => {
  assert.equal(
    readToolCallId({ toolCallId: "abc", state: "output-available" }),
    "abc",
  );
  assert.equal(readToolCallId({ state: "output-available" }), undefined);
});
