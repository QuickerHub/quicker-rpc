import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { stageShellProfileModule } from "./electron-shell-staging.mjs";

test("shell staging and the builder manifest both include the shared profile policy", () => {
  const agentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const base = resolve(agentRoot, "..", "..", "..", ".tmp");
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, "shell-profile-stage-"));
  try {
    const source = join(root, "source"), target = join(root, "shell-app");
    mkdirSync(join(source, "lib"), { recursive: true });
    const policy = "export const profileFixture = 'dedicated-profile';\n";
    writeFileSync(join(source, "lib", "agent-data-profile.mjs"), policy);
    stageShellProfileModule(source, target);
    assert.equal(readFileSync(join(target, "lib", "agent-data-profile.mjs"), "utf8"), policy);
    assert.equal(existsSync(join(target, "node_modules")), false, "asset staging does not install dependencies");
    const manifest = JSON.parse(readFileSync(join(agentRoot, "package.json"), "utf8"));
    assert.ok(manifest.build.files.includes("lib/agent-data-profile.mjs"));
  } finally {
    assert.ok(resolve(root).startsWith(resolve(base) + sep));
    rmSync(root, { recursive: true, force: true });
  }
});
