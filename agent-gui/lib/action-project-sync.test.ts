import assert from "node:assert/strict";
import test from "node:test";
import {
  compareActionEditVersions,
  formatSyncStatusMessage,
} from "./action-project-sync-types.ts";

test("compareActionEditVersions", () => {
  assert.equal(compareActionEditVersions(3, 3), "in_sync");
  assert.equal(compareActionEditVersions(2, 5), "quicker_ahead");
  assert.equal(compareActionEditVersions(6, 4), "disk_ahead");
  assert.equal(compareActionEditVersions(undefined, 1), "unknown_local");
  assert.equal(compareActionEditVersions(1, undefined), "unknown_remote");
});

test("formatSyncStatusMessage mentions versions", () => {
  const msg = formatSyncStatusMessage("quicker_ahead", 2, 5);
  assert.match(msg, /拉取/);
  assert.match(msg, /v2/);
  assert.match(msg, /v5/);
});
