import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

test("actual PowerShell production entries route static and explicit legacy without executing build/install/release", () => {
  const root = resolve(import.meta.dirname, "../..");
  const result = spawnSync("pwsh", ["-NoProfile", "-File", resolve(root, "publish/Test-AgentGuiBuildMode.ps1")], {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 12000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /19 offline cases passed; no native build\/install\/release executed/);
});
