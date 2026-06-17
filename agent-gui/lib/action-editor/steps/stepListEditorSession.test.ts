import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveStepListInitialSelection,
  setStepListEditorSession,
} from "@/lib/action-editor/steps/stepListEditorSession";

test("resolveStepListInitialSelection defaults to first step", () => {
  const result = resolveStepListInitialSelection("action-a/data.json", ["s1", "s2"]);
  assert.deepEqual(result, {
    selectedId: "s1",
    selectedIds: ["s1"],
    selectionAnchorId: "s1",
  });
});

test("resolveStepListInitialSelection restores cached single selection", () => {
  const path = "action-b/data.json";
  setStepListEditorSession(path, {
    selectedId: "s2",
    selectedIds: ["s2"],
    selectionAnchorId: "s2",
  });
  const result = resolveStepListInitialSelection(path, ["s1", "s2", "s3"]);
  assert.equal(result.selectedId, "s2");
  assert.deepEqual(result.selectedIds, ["s2"]);
});

test("resolveStepListInitialSelection restores cached multi selection", () => {
  const path = "action-c/data.json";
  setStepListEditorSession(path, {
    selectedId: "s3",
    selectedIds: ["s2", "s3"],
    selectionAnchorId: "s2",
  });
  const result = resolveStepListInitialSelection(path, ["s1", "s2", "s3"]);
  assert.equal(result.selectedId, "s3");
  assert.deepEqual(result.selectedIds, ["s2", "s3"]);
  assert.equal(result.selectionAnchorId, "s2");
});

test("resolveStepListInitialSelection ignores stale cached ids", () => {
  const path = "action-d/data.json";
  setStepListEditorSession(path, {
    selectedId: "gone",
    selectedIds: ["gone", "s1"],
    selectionAnchorId: "gone",
  });
  const result = resolveStepListInitialSelection(path, ["s1", "s2"]);
  assert.equal(result.selectedId, "s1");
  assert.deepEqual(result.selectedIds, ["s1"]);
});
