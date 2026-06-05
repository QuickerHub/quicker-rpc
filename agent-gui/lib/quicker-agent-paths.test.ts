import test from "node:test";
import assert from "node:assert/strict";
import {
  QUICKER_AGENT_WORKSPACE_SUBDIR,
  resolveReleaseDefaultWorkingDirectory,
  resolveVoiceAsrPluginDirectory,
} from "./quicker-agent-paths.ts";

test("release workspace is under Documents/QuickerAgent/workspace", () => {
  const cwd = resolveReleaseDefaultWorkingDirectory();
  assert.ok(cwd.endsWith(`QuickerAgent${process.platform === "win32" ? "\\" : "/"}${QUICKER_AGENT_WORKSPACE_SUBDIR}`) ||
    cwd.endsWith(`QuickerAgent/${QUICKER_AGENT_WORKSPACE_SUBDIR}`));
  assert.ok(!cwd.includes("plugins"));
});

test("voice plugin dir is not under release workspace", () => {
  const plugin = resolveVoiceAsrPluginDirectory();
  const workspace = resolveReleaseDefaultWorkingDirectory();
  assert.ok(!workspace.startsWith(plugin));
  assert.ok(!plugin.startsWith(workspace));
});
