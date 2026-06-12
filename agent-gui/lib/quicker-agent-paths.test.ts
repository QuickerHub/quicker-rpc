import test from "node:test";
import assert from "node:assert/strict";
import {
  QUICKER_AGENT_WORKSPACE_SUBDIR,
  resolveQuickerAgentAppDataDirectory,
  resolveQuickerAgentInstallDirectory,
  resolveReleaseDefaultWorkingDirectory,
  resolveVoiceAsrPluginDirectory,
} from "./quicker-agent-paths.ts";

test("release workspace is under Documents/QuickerAgent/workspace", () => {
  const cwd = resolveReleaseDefaultWorkingDirectory();
  assert.ok(cwd.endsWith(`QuickerAgent${process.platform === "win32" ? "\\" : "/"}${QUICKER_AGENT_WORKSPACE_SUBDIR}`) ||
    cwd.endsWith(`QuickerAgent/${QUICKER_AGENT_WORKSPACE_SUBDIR}`));
  assert.ok(!cwd.includes("plugins"));
});

test("windows install dir and app-data dir are separate when APPDATA is set", () => {
  if (process.platform !== "win32") return;
  const prevLocal = process.env.LOCALAPPDATA;
  const prevAppData = process.env.APPDATA;
  process.env.LOCALAPPDATA = "C:\\Local";
  process.env.APPDATA = "C:\\Roaming";
  assert.notEqual(
    resolveQuickerAgentInstallDirectory(),
    resolveQuickerAgentAppDataDirectory(),
  );
  if (prevLocal === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = prevLocal;
  if (prevAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = prevAppData;
});

test("voice plugin dir is not under release workspace", () => {
  const plugin = resolveVoiceAsrPluginDirectory();
  const workspace = resolveReleaseDefaultWorkingDirectory();
  assert.ok(!workspace.startsWith(plugin));
  assert.ok(!plugin.startsWith(workspace));
});
