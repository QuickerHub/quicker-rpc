import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isActionExplorerWatchPath,
  resolveProgramDataPathFromWatch,
} from "./action-explorer-watch";

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

test("resolveProgramDataPathFromWatch maps fs.watch filename to workspace path", () => {
  const actionId = "846b4132-ad73-42e8-b2f9-c42fe718ae20";
  assert.equal(
    resolveProgramDataPathFromWatch(
      ".quicker/actions",
      `${actionId}/data.json`,
    ),
    `.quicker/actions/${actionId}/data.json`,
  );
  assert.equal(
    resolveProgramDataPathFromWatch(
      ".quicker/actions",
      `${actionId}\\data.json`,
    ),
    `.quicker/actions/${actionId}/data.json`,
  );
  assert.equal(
    resolveProgramDataPathFromWatch(
      ".quicker/actions",
      `${actionId}/subprograms/sub-1/data.json`,
    ),
    `.quicker/actions/${actionId}/subprograms/sub-1/data.json`,
  );
  assert.equal(
    resolveProgramDataPathFromWatch(".quicker/subprograms", "foo/data.json"),
    ".quicker/subprograms/foo/data.json",
  );
  assert.equal(
    resolveProgramDataPathFromWatch(".quicker/actions", "info.json"),
    null,
  );
});