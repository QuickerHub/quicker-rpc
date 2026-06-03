import assert from "node:assert/strict";
import { test } from "node:test";
import { navigateVariableSelectionVertically } from "./actionVariableUi.ts";

test("navigateVariableSelectionVertically moves within ordered ids", () => {
  const ids = ["a", "b", "c"];
  assert.equal(navigateVariableSelectionVertically(ids, "a", 1), "b");
  assert.equal(navigateVariableSelectionVertically(ids, "b", -1), "a");
  assert.equal(navigateVariableSelectionVertically(ids, "c", 1), null);
  assert.equal(navigateVariableSelectionVertically(ids, "a", -1), null);
});

test("navigateVariableSelectionVertically picks edge when selection is outside list", () => {
  const ids = ["a", "b", "c"];
  assert.equal(navigateVariableSelectionVertically(ids, "missing", 1), "b");
  assert.equal(navigateVariableSelectionVertically(ids, "missing", -1), "b");
});
