import assert from "node:assert/strict";
import test from "node:test";
import {
  compareActionEditVersions,
  formatSyncStatusMessage,
  isActionProjectVersionConflictError,
  resolveActionProjectSyncAction,
  resolveActionProjectSyncDecision,
} from "./action-project-sync-types.ts";

test("compareActionEditVersions", () => {
  assert.equal(compareActionEditVersions(3, 3), "in_sync");
  assert.equal(compareActionEditVersions(2, 5), "quicker_ahead");
  assert.equal(compareActionEditVersions(6, 4), "disk_ahead");
  assert.equal(compareActionEditVersions(undefined, 1), "unknown_local");
  assert.equal(compareActionEditVersions(1, undefined), "unknown_remote");
  assert.equal(compareActionEditVersions(1780917082345, 0), "unknown_remote");
  assert.equal(
    compareActionEditVersions(1780917082345, undefined, {
      trustedRemoteEditVersion: 1780917082345,
    }),
    "in_sync",
  );
});

test("resolveActionProjectSyncAction", () => {
  assert.equal(resolveActionProjectSyncAction("in_sync"), "none");
  assert.equal(resolveActionProjectSyncAction("quicker_ahead"), "pull");
  assert.equal(resolveActionProjectSyncAction("unknown_local"), "pull");
  assert.equal(resolveActionProjectSyncAction("disk_ahead"), "push");
  assert.equal(resolveActionProjectSyncAction("unknown_remote"), "none");
});

test("formatSyncStatusMessage mentions versions", () => {
  const msg = formatSyncStatusMessage("quicker_ahead", 2, 5);
  assert.match(msg, /拉取/);
  assert.match(msg, /v2/);
  assert.match(msg, /v5/);
});

test("resolveActionProjectSyncDecision", () => {
  const base = {
    message: "",
    localEditVersion: 2,
    remoteEditVersion: 5,
  };
  assert.deepEqual(
    resolveActionProjectSyncDecision({ ...base, state: "quicker_ahead" }),
    { kind: "pull" },
  );
  assert.deepEqual(
    resolveActionProjectSyncDecision(
      { ...base, state: "quicker_ahead" },
      { hasLocalChanges: true },
    ),
    { kind: "conflict", status: { ...base, state: "quicker_ahead" } },
  );
  assert.deepEqual(
    resolveActionProjectSyncDecision({ ...base, state: "disk_ahead" }),
    { kind: "push" },
  );
  assert.deepEqual(
    resolveActionProjectSyncDecision(
      { state: "unknown_local", message: "", remoteEditVersion: 5 },
      { hasLocalChanges: true },
    ),
    { kind: "push" },
  );
  assert.deepEqual(
    resolveActionProjectSyncDecision(
      { state: "in_sync", message: "", localEditVersion: 3, remoteEditVersion: 3 },
      { hasLocalChanges: true },
    ),
    { kind: "push" },
  );
  assert.deepEqual(
    resolveActionProjectSyncDecision(
      { state: "unknown_local", message: "", remoteEditVersion: 5 },
      { hasLocalChanges: true },
    ),
    { kind: "push" },
  );
  assert.deepEqual(
    resolveActionProjectSyncDecision(
      { state: "in_sync", message: "", localEditVersion: 3, remoteEditVersion: 3 },
    ),
    { kind: "none" },
  );
});

test("isActionProjectVersionConflictError", () => {
  assert.equal(
    isActionProjectVersionConflictError(
      "Version conflict: action was modified in Quicker.",
    ),
    true,
  );
  assert.equal(isActionProjectVersionConflictError("network error"), false);
});
