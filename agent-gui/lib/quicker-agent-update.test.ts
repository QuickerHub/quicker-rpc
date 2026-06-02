import assert from "node:assert/strict";
import test from "node:test";
import { compareSemver, parseSemver } from "./semver.ts";
import { buildQuickerAgentDownloadUrl } from "./quicker-agent-update.ts";

test("parseSemver accepts v-prefix", () => {
  assert.deepEqual(parseSemver("v1.2.3"), [1, 2, 3]);
});

test("compareSemver detects newer remote", () => {
  assert.ok(compareSemver("0.8.6", "0.8.2") > 0);
  assert.ok(compareSemver("0.8.2", "0.8.6") < 0);
});

test("buildQuickerAgentDownloadUrl uses bitiful prefix", () => {
  const url = buildQuickerAgentDownloadUrl("0.8.6");
  assert.match(url, /quicker-agent-0\.8\.6-x64-setup\.exe$/);
});
