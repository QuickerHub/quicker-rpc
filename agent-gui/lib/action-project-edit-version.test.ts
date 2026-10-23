import assert from "node:assert/strict";
import test from "node:test";
import { normalizeActionProjectEditVersion as normalize, comparePreciseActionProjectEditVersions } from "./action-project-edit-version";
import { compareActionEditVersions, formatSyncStatusMessage, resolveActionProjectSyncDecision } from "./action-project-sync-types";
import { readEditVersionFromGetPayload, hasImpreciseEditVersionFromGetPayload } from "./action-project-info-from-get";
import { parseQkrpcJson } from "./qkrpc-json";
import { parseActionProjectInfo } from "./action-project-info-parse";
import { buildWorkspaceProjectSummary, parseWorkspaceToolDisplay } from "./action-project-display";

const a = "9007199254740992";
const b = "9007199254740993";
const max = "9223372036854775807";

test("edit versions remain JSON-safe and exact across the full positive Int64 range", () => {
  assert.equal(normalize(42), 42);
  assert.equal(normalize("00042"), 42);
  assert.equal(normalize(BigInt(b)), b);
  assert.equal(normalize(a), a);
  assert.equal(normalize(max), max);
  for (const invalid of [0, -1, 1.5, NaN, Infinity, Number(a), Number(b), "", "-1", "1e3", "1.5", " 42 ", "9223372036854775808"]) {
    assert.equal(normalize(invalid), undefined, String(invalid));
  }
  assert.equal(JSON.stringify({ editVersion: normalize(max) }), `{"editVersion":"${max}"}`);
  assert.equal(comparePreciseActionProjectEditVersions(a, b), -1);
  assert.equal(comparePreciseActionProjectEditVersions(b, a), 1);
});

test("adjacent Int64 versions keep pull/push/conflict decisions available to the real Sync button", () => {
  assert.equal(compareActionEditVersions(a, b), "quicker_ahead");
  assert.equal(compareActionEditVersions(b, a), "disk_ahead");
  assert.equal(compareActionEditVersions(b, b), "in_sync");
  assert.equal(compareActionEditVersions("42", 42), "in_sync");
  assert.equal(compareActionEditVersions(a, undefined, { trustedRemoteEditVersion: a }), "in_sync");
  assert.equal(compareActionEditVersions(Number(a), a, { trustedRemoteEditVersion: a }), "unknown_local");
  assert.equal(compareActionEditVersions(a, Number(a), { trustedRemoteEditVersion: a }), "unknown_remote");
  assert.equal(compareActionEditVersions(a, max, { trustedRemoteEditVersion: b }), "quicker_ahead");
  const status = { state: compareActionEditVersions(a, b), message: "", localEditVersion: a, remoteEditVersion: b };
  assert.deepEqual(resolveActionProjectSyncDecision(status), { kind: "pull" });
  assert.deepEqual(resolveActionProjectSyncDecision(status, { hasLocalChanges: true }), { kind: "conflict", status });
  assert.deepEqual(resolveActionProjectSyncDecision({ ...status, state: compareActionEditVersions(b, a) }), { kind: "push" });
  assert.deepEqual(resolveActionProjectSyncDecision({ ...status, state: "in_sync" }, { hasLocalChanges: true }), { kind: "push" });
  assert.match(formatSyncStatusMessage("quicker_ahead", a, b), new RegExp(`v${a}.*v${b}`));
});

test("raw native JSON, info, manifest and tool summaries preserve exact versions without changing unrelated payloads", () => {
  const payload = parseQkrpcJson(`{"editVersion":${b},"compressed":{"title":"Fixture"},"other":42}`) as Record<string, unknown>;
  assert.equal(readEditVersionFromGetPayload(payload), b);
  assert.equal(hasImpreciseEditVersionFromGetPayload(payload), false);
  assert.equal(readEditVersionFromGetPayload({ editVersion: Number(b), compressed: { editVersion: 42 } }), undefined);
  assert.equal(readEditVersionFromGetPayload({ compressed: `{"EditVersion":${max}}` }), max);
  const parsed = parseActionProjectInfo(`{"id":"fixture","title":"Fixture","EditVersion":${b}}`);
  assert.equal(parsed.ok && parsed.data.editVersion, b);
  assert.equal(parseActionProjectInfo('{"id":"fixture","title":"Fixture","editVersion":1.5}').ok, false);
  const summary = buildWorkspaceProjectSummary({ projectDirectory: ".quicker/actions/fixture", editVersion: b, fileRefs: [] });
  assert.equal(summary.editVersion, b);
  assert.equal(parseWorkspaceToolDisplay({ workspaceSynced: true, workspaceProject: summary })?.editVersion, b);
  assert.equal(buildWorkspaceProjectSummary({ ...summary, editVersion: Number(b), fileRefs: [] }).editVersion, undefined);
});
