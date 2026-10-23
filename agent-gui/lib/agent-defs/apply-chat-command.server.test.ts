import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeToolRestrictions } from "./tool-restrictions";
import { restrictComposedTools } from "@/lib/chat-tool-selection";

test("disjoint command and parent permissions remain an empty intersection", () => {
  const allowed = mergeToolRestrictions(["Read"], ["Write"]);
  assert.deepEqual(allowed, []);
  assert.deepEqual(restrictComposedTools({ Read: {}, Write: {} }, allowed), {});
});

test("missing restriction preserves the parent, explicit empty never inherits", () => {
  assert.deepEqual(mergeToolRestrictions(["Read"], undefined), ["Read"]);
  assert.deepEqual(mergeToolRestrictions(["Read"], []), []);
  assert.deepEqual(mergeToolRestrictions([], ["Write"]), []);
  assert.deepEqual(mergeToolRestrictions(undefined, ["Read"]), ["Read"]);
});
