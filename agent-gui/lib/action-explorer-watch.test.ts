import assert from "node:assert/strict";
import { test } from "node:test";
import { isActionExplorerWatchPath } from "./action-explorer-watch";

test("isActionExplorerWatchPath matches .quicker/actions and subprograms tree", () => {
  assert.equal(isActionExplorerWatchPath(".quicker/actions"), true);
  assert.equal(
    isActionExplorerWatchPath(".quicker/actions/foo/data.json"),
    true,
  );
  assert.equal(isActionExplorerWatchPath(".quicker/subprograms"), true);
  assert.equal(
    isActionExplorerWatchPath(".quicker/subprograms/foo/data.json"),
    true,
  );
  assert.equal(isActionExplorerWatchPath(".quicker"), true);
  assert.equal(isActionExplorerWatchPath("src/main.ts"), false);
});
