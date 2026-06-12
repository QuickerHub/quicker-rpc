import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  bundledNodeExe,
  isCompleteResourceRoot,
  resolveResourceRoot,
} from "./paths.mjs";

function stageMinimalBundle(root) {
  mkdirSync(join(root, "app"), { recursive: true });
  mkdirSync(join(root, "node"), { recursive: true });
  writeFileSync(join(root, "app", "server.js"), "export {};\n", "utf8");
  writeFileSync(bundledNodeExe(root), "node", "utf8");
}

test("isCompleteResourceRoot requires app/server.js and bundled node", () => {
  const root = mkdtempSync(join(tmpdir(), "qa-paths-"));
  stageMinimalBundle(root);
  assert.equal(isCompleteResourceRoot(root), true);
});

test("resolveResourceRoot prefers flat layout under resourcesPath", () => {
  const base = mkdtempSync(join(tmpdir(), "qa-paths-flat-"));
  stageMinimalBundle(base);
  const root = resolveResourceRoot({
    isPackaged: true,
    resourcesPath: base,
  });
  assert.equal(root, base);
});

test("resolveResourceRoot accepts legacy nested resources/resources layout", () => {
  const base = mkdtempSync(join(tmpdir(), "qa-paths-nested-"));
  const nested = join(base, "resources");
  stageMinimalBundle(nested);
  const root = resolveResourceRoot({
    isPackaged: true,
    resourcesPath: base,
  });
  assert.equal(root, nested);
});

test("resolveResourceRoot rejects server.js without bundled node", () => {
  const base = mkdtempSync(join(tmpdir(), "qa-paths-incomplete-"));
  mkdirSync(join(base, "app"), { recursive: true });
  writeFileSync(join(base, "app", "server.js"), "export {};\n", "utf8");
  assert.throws(
    () =>
      resolveResourceRoot({
        isPackaged: true,
        resourcesPath: base,
      }),
    /runtime bundle incomplete/,
  );
});
