import assert from "node:assert/strict";
import { test } from "node:test";
import { isQuickerActionMissingError } from "./action-command-client";

test("isQuickerActionMissingError detects English not-found messages", () => {
  assert.equal(
    isQuickerActionMissingError("Action not found: fc874212-dadf-4d3f-940a-7c7a5f1aae62"),
    true,
  );
  assert.equal(isQuickerActionMissingError("Action page not found: abc"), true);
});

test("isQuickerActionMissingError rejects other failures", () => {
  assert.equal(isQuickerActionMissingError("删除动作已取消或失败。"), false);
  assert.equal(isQuickerActionMissingError("pipe connect failed"), false);
  assert.equal(isQuickerActionMissingError(""), false);
});
