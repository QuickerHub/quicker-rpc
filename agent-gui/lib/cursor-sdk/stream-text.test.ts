import assert from "node:assert/strict";
import test from "node:test";
import {
  computeAssistantTextDelta,
  mergeEmittedAssistantText,
} from "./stream-text.ts";

test("computeAssistantTextDelta handles cumulative snapshots", () => {
  assert.equal(computeAssistantTextDelta("hello", ""), "hello");
  assert.equal(computeAssistantTextDelta("hello world", "hello"), " world");
  assert.equal(computeAssistantTextDelta("hello", "hello"), null);
});

test("computeAssistantTextDelta handles suffix-only chunks", () => {
  assert.equal(computeAssistantTextDelta("tr", "需要先"), "tr");
  assert.equal(
    mergeEmittedAssistantText("需要先", "tr", "tr"),
    "需要先tr",
  );
});
