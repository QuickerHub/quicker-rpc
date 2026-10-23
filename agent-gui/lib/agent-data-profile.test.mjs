import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { AGENT_DATA_DIRECTORY_ENV, configureAgentDataProfile, normalizeAgentDataDirectory, resolveAgentDataProfile, resolveDefaultAgentDataDirectory } from "./agent-data-profile.mjs";

test("historical OS defaults are pure across Windows, macOS and Linux", () => {
  assert.equal(resolveDefaultAgentDataDirectory({ platform: "win32", home: "C:\\fixture-home", env: { APPDATA: "C:\\roaming", LOCALAPPDATA: "C:\\local" } }), "C:\\roaming\\QuickerAgent");
  assert.equal(resolveDefaultAgentDataDirectory({ platform: "win32", home: "C:\\fixture-home", env: { LOCALAPPDATA: "C:\\local" } }), "C:\\local\\QuickerAgent");
  assert.equal(resolveDefaultAgentDataDirectory({ platform: "darwin", home: "/fixture-home", env: { XDG_DATA_HOME: "/ignored" } }), "/fixture-home/Library/Application Support/QuickerAgent");
  assert.equal(resolveDefaultAgentDataDirectory({ platform: "linux", home: "/fixture-home", env: { XDG_DATA_HOME: "/fixture-xdg" } }), "/fixture-xdg/QuickerAgent");
  assert.equal(resolveDefaultAgentDataDirectory({ platform: "linux", home: "/fixture-home", env: {} }), "/fixture-home/.local/share/QuickerAgent");
});

test("profile resolution defaults to the historical path and rejects relative overrides", () => {
  const previous = process.env[AGENT_DATA_DIRECTORY_ENV];
  try {
    delete process.env[AGENT_DATA_DIRECTORY_ENV];
    assert.deepEqual(resolveAgentDataProfile(), { directory: resolveDefaultAgentDataDirectory(), explicit: false });
    for (const value of ["relative", "", " "]) assert.throws(() => normalizeAgentDataDirectory(value), /absolute/);
    process.env[AGENT_DATA_DIRECTORY_ENV] = "relative";
    assert.throws(() => resolveAgentDataProfile(), /absolute/);
    if (process.platform === "win32") assert.throws(() => normalizeAgentDataDirectory("\\rooted-without-drive"), /absolute/);
  } finally {
    if (previous === undefined) delete process.env[AGENT_DATA_DIRECTORY_ENV];
    else process.env[AGENT_DATA_DIRECTORY_ENV] = previous;
  }
});

test("bootstrap selection wins over env and remains fixed across duplicate module instances", async () => {
  const previous = process.env[AGENT_DATA_DIRECTORY_ENV];
  const selected = resolve(".tmp", "dedicated profile");
  try {
    process.env[AGENT_DATA_DIRECTORY_ENV] = resolve(".tmp", "ambient-profile");
    const profile = configureAgentDataProfile(selected);
    assert.deepEqual(profile, { directory: selected, explicit: true });
    assert.equal(process.env[AGENT_DATA_DIRECTORY_ENV], selected);
    process.env[AGENT_DATA_DIRECTORY_ENV] = resolve(".tmp", "changed-env");
    assert.equal(resolveAgentDataProfile(), profile);
    const duplicate = await import("./agent-data-profile.mjs?profile-test-instance=2");
    assert.equal(duplicate.resolveAgentDataProfile(), profile);
    assert.throws(() => duplicate.configureAgentDataProfile(resolve(".tmp", "another-profile")), /already configured/);
    assert.equal(configureAgentDataProfile(selected), profile);
  } finally {
    if (previous === undefined) delete process.env[AGENT_DATA_DIRECTORY_ENV];
    else process.env[AGENT_DATA_DIRECTORY_ENV] = previous;
  }
});
