import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { shouldTriggerHotUpdate } from "./watch-hot-update.mjs";

const repoRoot = "D:/repo/quicker-rpc";

function abs(rel) {
  return join(repoRoot, rel);
}

test("ignores root publish build outputs", () => {
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("publish/cli/qkrpc.exe")), false);
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("publish/cli/skills/foo/SKILL.md")), false);
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("publish/plugin/QuickerRpc.Plugin.dll")), false);
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("publish/qkrpc-1.2.3-win-x64.zip")), false);
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("publish/latest.json")), false);
});

test("keeps root publish source scripts hot", () => {
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("publish/publish-rpc.ps1")), true);
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("publish/qkrpc-publish-lib.ps1")), true);
});

test("ignores other generated build outputs", () => {
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("version.json")), false);
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("build.ps1")), false);
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("QuickerRpc.Console/bin/Release/x.dll")), false);
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("QuickerRpc.Console/publish/qkrpc.exe")), false);
});

test("keeps project source files hot", () => {
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("QuickerRpc.Console/Program.cs")), true);
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("QuickerRpc.Console/QuickerRpc.Console.csproj")), true);
  assert.equal(shouldTriggerHotUpdate(repoRoot, abs("docs/action-authoring-src/foo.json")), true);
});
