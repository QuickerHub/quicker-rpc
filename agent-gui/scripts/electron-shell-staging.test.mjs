import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { stageShellProfileModule } from "./electron-shell-staging.mjs";

test("shell staging, manifest and static checks allow only the shared profile policy from lib", () => {
  const agentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const base = resolve(agentRoot, "..", "..", "..", ".tmp");
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, "shell-profile-stage-"));
  try {
    const source = join(root, "source"), target = join(root, "shell-app");
    mkdirSync(join(source, "lib"), { recursive: true });
    const policy = "export const profileFixture = 'dedicated-profile';\n";
    writeFileSync(join(source, "lib", "agent-data-profile.mjs"), policy);
    writeFileSync(join(source, "lib", "other-helper.mjs"), "export const notStaged = true;\n");
    stageShellProfileModule(source, target);
    assert.equal(readFileSync(join(target, "lib", "agent-data-profile.mjs"), "utf8"), policy);
    assert.equal(existsSync(join(target, "lib", "other-helper.mjs")), false);
    assert.equal(existsSync(join(target, "node_modules")), false, "asset staging does not install dependencies");
    const manifest = JSON.parse(readFileSync(join(agentRoot, "package.json"), "utf8"));
    assert.ok(manifest.build.files.includes("lib/agent-data-profile.mjs"));

    const scripts = join(source, "scripts"), electron = join(source, "electron");
    mkdirSync(scripts);
    mkdirSync(electron);
    const checker = join(scripts, "electron-check.mjs");
    writeFileSync(checker, readFileSync(join(agentRoot, "scripts", "electron-check.mjs")));
    writeFileSync(join(electron, "electron-api.mjs"), "export const fixture = true;\n");
    const fixtureModule = join(electron, "fixture.mjs");
    writeFileSync(fixtureModule, 'import "../lib/agent-data-profile.mjs";\n');
    const allowed = spawnSync(process.execPath, [checker], { encoding: "utf8" });
    assert.equal(allowed.status, 0, allowed.stderr);

    writeFileSync(fixtureModule, 'import "../lib/other-helper.mjs";\n');
    const rejected = spawnSync(process.execPath, [checker], { encoding: "utf8" });
    assert.equal(rejected.status, 1, rejected.stdout);
    assert.match(rejected.stderr, /relative import escapes staged source roots: \.\.\/lib\/other-helper\.mjs/);
  } finally {
    assert.ok(resolve(root).startsWith(resolve(base) + sep));
    rmSync(root, { recursive: true, force: true });
  }
});
