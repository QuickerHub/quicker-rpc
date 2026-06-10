import assert from "node:assert/strict";
import test from "node:test";

import { parsePreviewTabId, previewTabId } from "@/lib/workbench/preview-tab-id";

test("previewTabId round-trips", () => {
  const id = previewTabId("file", ".quicker/actions/foo/data.json");
  assert.equal(id, "file:.quicker/actions/foo/data.json");
  assert.deepEqual(parsePreviewTabId(id), {
    kind: "file",
    path: ".quicker/actions/foo/data.json",
  });
});

test("parsePreviewTabId returns null for unknown ids", () => {
  assert.equal(parsePreviewTabId("__preview__"), null);
});
