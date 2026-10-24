import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { cleanupRetiredStaticResourceMarkers } from "./electron-static-resource-cleanup.mjs";

const temporary = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp");
function fixture(t) {
  mkdirSync(temporary, { recursive: true });
  const root = mkdtempSync(join(temporary, "static-resource-cleanup-"));
  t.after(() => {
    const suffix = relative(temporary, root);
    assert.ok(suffix && !suffix.startsWith("..") && !suffix.includes(sep));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function file(root, name, value) { const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); }

test("static preparation removes all four retired root markers and preserves ordinary resources and user data", (t) => {
  const root = fixture(t), resources = join(root, "resources");
  const retired = ["voice-plugin-channel.json", "voice-plugin-manifest.json", "voice-sensevoice-model-identity.json", "plugin-registry-bootstrap.json"];
  for (const name of retired) file(resources, name, "retired generated metadata");
  const preserved = ["app/service.mjs", "node/node.exe", "qkrpc/qkrpc.exe", "rg/rg.exe", "llm-publish.config.json", "voice-plugin-channel.json.bak", "app/voice-plugin-channel.json", "VoxType/action.json", ".local/preferences.json", "agent.db"];
  for (const name of preserved) file(resources, name, `preserved fixture bytes: ${name}`);
  file(root, "user-data/voice-plugin-channel.json", "outside resource root");
  assert.deepEqual(cleanupRetiredStaticResourceMarkers(resources), retired);
  for (const name of retired) assert.equal(existsSync(join(resources, name)), false, `${name} must not reach extraResources`);
  for (const name of preserved) assert.equal(readFileSync(join(resources, name), "utf8"), `preserved fixture bytes: ${name}`);
  assert.equal(readFileSync(join(root, "user-data/voice-plugin-channel.json"), "utf8"), "outside resource root");
  assert.deepEqual(cleanupRetiredStaticResourceMarkers(resources), []);
});

test("missing resources are harmless and non-file markers reject before any deletion", (t) => {
  const root = fixture(t), resources = join(root, "resources");
  assert.deepEqual(cleanupRetiredStaticResourceMarkers(resources), []);
  file(resources, "voice-plugin-channel.json", "retired fixture");
  mkdirSync(join(resources, "voice-plugin-manifest.json"));
  file(resources, "voice-plugin-manifest.json/preserve.txt", "unexpected directory payload");
  assert.throws(() => cleanupRetiredStaticResourceMarkers(resources), /not a regular file/);
  assert.equal(readFileSync(join(resources, "voice-plugin-channel.json"), "utf8"), "retired fixture");
  assert.equal(readFileSync(join(resources, "voice-plugin-manifest.json/preserve.txt"), "utf8"), "unexpected directory payload");
});

test("resource root and parent junctions cannot redirect cleanup into another directory", (t) => {
  const root = fixture(t), external = join(root, "external"), redirected = join(root, "redirected");
  file(external, "resources/voice-plugin-channel.json", "outside payload");
  symlinkSync(external, redirected, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => cleanupRetiredStaticResourceMarkers(join(redirected, "resources")), /redirected/);
  assert.throws(() => cleanupRetiredStaticResourceMarkers(redirected), /redirected/);
  assert.equal(readFileSync(join(external, "resources/voice-plugin-channel.json"), "utf8"), "outside payload");
});
