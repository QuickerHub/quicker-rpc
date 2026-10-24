import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import test from "node:test";
import {
  bundledNodeExe,
  isCompleteResourceRoot,
  resolveResourceRoot,
} from "./paths.mjs";

const temporaryRoot = resolve(import.meta.dirname, "../../.tmp/electron-paths-tests");

function fixture(t) {
  mkdirSync(temporaryRoot, { recursive: true });
  const root = mkdtempSync(join(temporaryRoot, "run-"));
  t.after(() => {
    assert.ok(resolve(root).startsWith(temporaryRoot + sep));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function write(root, file, content = "fixture\n") {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
}

function stageMinimalBundle(root, mode = "static") {
  if (mode === "static") {
    write(root, "app/runtime-manifest.json", { format: "quicker-agent-static-runtime", version: 1, next: false });
    for (const file of ["service.mjs", "lib/service-main.mjs", "renderer/index.html"]) write(root, `app/${file}`);
  } else {
    write(root, "app/runtime-mode.json", { format: "quicker-agent-runtime-mode", version: 1, mode });
    write(root, "app/server.js", "export {};\n");
  }
  const node = bundledNodeExe(root);
  mkdirSync(dirname(node), { recursive: true });
  writeFileSync(node, "node\n");
}

test("isCompleteResourceRoot accepts the complete default static runtime and bundled node", (t) => {
  const root = fixture(t);
  stageMinimalBundle(root);
  assert.equal(isCompleteResourceRoot(root), true);
});

test("isCompleteResourceRoot accepts only explicitly selected legacy bundles", (t) => {
  const root = fixture(t);
  stageMinimalBundle(root, "legacy-next");
  assert.equal(isCompleteResourceRoot(root), true);
  rmSync(join(root, "app/runtime-mode.json"));
  assert.equal(isCompleteResourceRoot(root), false, "an old server.js alone cannot make the new production default legacy");
});

for (const missing of ["app/runtime-manifest.json", "app/service.mjs", "app/lib/service-main.mjs", "app/renderer/index.html", "node"]) {
  test(`isCompleteResourceRoot returns false, rather than throwing, when ${missing} is missing`, (t) => {
    const root = fixture(t);
    stageMinimalBundle(root);
    write(root, "app/server.js");
    rmSync(missing === "node" ? bundledNodeExe(root) : join(root, missing));
    assert.equal(isCompleteResourceRoot(root), false);
  });
}

test("isCompleteResourceRoot returns false for invalid mode and static metadata", (t) => {
  const root = fixture(t);
  stageMinimalBundle(root);
  write(root, "app/runtime-mode.json", { format: "quicker-agent-runtime-mode", version: 1, mode: "unknown" });
  assert.equal(isCompleteResourceRoot(root), false);
  write(root, "app/runtime-mode.json", "{broken");
  assert.equal(isCompleteResourceRoot(root), false);
  rmSync(join(root, "app/runtime-mode.json"));
  write(root, "app/runtime-manifest.json", "{broken");
  assert.equal(isCompleteResourceRoot(root), false);
});

test("resolveResourceRoot prefers the valid flat layout under resourcesPath", (t) => {
  const base = fixture(t);
  stageMinimalBundle(base);
  stageMinimalBundle(join(base, "resources"));
  const root = resolveResourceRoot({
    isPackaged: true,
    resourcesPath: base,
  });
  assert.equal(root, base);
});

test("resolveResourceRoot accepts an explicitly legacy nested resources/resources layout", (t) => {
  const base = fixture(t);
  const nested = join(base, "resources");
  stageMinimalBundle(nested, "legacy-next");
  const root = resolveResourceRoot({
    isPackaged: true,
    resourcesPath: base,
  });
  assert.equal(root, nested);
});

for (const invalid of ["mode", "static-entry", "node", "unmarked-legacy"]) {
  test(`resolveResourceRoot continues to a valid nested root after an invalid flat ${invalid}`, (t) => {
    const base = fixture(t);
    stageMinimalBundle(base, invalid === "unmarked-legacy" ? "legacy-next" : "static");
    if (invalid === "mode") write(base, "app/runtime-mode.json", "{broken");
    if (invalid === "static-entry") rmSync(join(base, "app/service.mjs"));
    if (invalid === "node") rmSync(bundledNodeExe(base));
    if (invalid === "unmarked-legacy") rmSync(join(base, "app/runtime-mode.json"));
    const nested = join(base, "resources");
    stageMinimalBundle(nested);
    assert.equal(isCompleteResourceRoot(base), false);
    assert.equal(resolveResourceRoot({ isPackaged: true, resourcesPath: base }), nested);
  });
}

test("resolveResourceRoot aggregates the candidate paths and their different missing runtime entries", (t) => {
  const base = fixture(t);
  const nested = join(base, "resources");
  stageMinimalBundle(base);
  rmSync(join(base, "app/service.mjs"));
  stageMinimalBundle(nested, "legacy-next");
  rmSync(join(nested, "app/server.js"));
  assert.throws(() => resolveResourceRoot({ isPackaged: true, resourcesPath: base }), (error) => {
    assert.ok(error instanceof Error);
    for (const detail of [base, nested, "service.mjs", "server.js"]) assert.ok(error.message.includes(detail), error.message);
    return true;
  });
});

for (const runtimeMode of ["static", "legacy-next"]) {
  test(`a ${runtimeMode} shell cannot fall back from incomplete flat resources to the opposing nested mode`, (t) => {
    const base = fixture(t);
    const nested = join(base, "resources");
    const otherMode = runtimeMode === "static" ? "legacy-next" : "static";
    stageMinimalBundle(base, runtimeMode);
    write(base, "app/runtime-mode.json", { format: "quicker-agent-runtime-mode", version: 1, mode: runtimeMode });
    rmSync(join(base, "app", runtimeMode === "static" ? "service.mjs" : "server.js"));
    stageMinimalBundle(nested, otherMode);
    write(nested, "app/runtime-mode.json", { format: "quicker-agent-runtime-mode", version: 1, mode: otherMode });
    const app = { isPackaged: true, resourcesPath: base };
    assert.equal(resolveResourceRoot(app), nested, "the generic resolver still accepts the complete marker-selected candidate");
    assert.equal(isCompleteResourceRoot(nested, { runtimeMode }), false);
    assert.throws(() => resolveResourceRoot(app, { runtimeMode }), (error) => {
      assert.ok(error instanceof Error);
      for (const detail of [base, nested, runtimeMode, otherMode, join(nested, "app/runtime-mode.json")]) assert.ok(error.message.includes(detail), error.message);
      return true;
    });
  });

  test(`a ${runtimeMode} shell retains same-mode nested layout compatibility after incomplete flat resources`, (t) => {
    const base = fixture(t);
    const nested = join(base, "resources");
    stageMinimalBundle(base, runtimeMode);
    rmSync(join(base, "app", runtimeMode === "static" ? "service.mjs" : "server.js"));
    stageMinimalBundle(nested, runtimeMode);
    assert.equal(resolveResourceRoot({ isPackaged: true, resourcesPath: base }, { runtimeMode }), nested);
  });

  test(`a ${runtimeMode} shell skips complete flat resources marked for the opposing mode`, (t) => {
    const base = fixture(t);
    const nested = join(base, "resources");
    const otherMode = runtimeMode === "static" ? "legacy-next" : "static";
    stageMinimalBundle(base, otherMode);
    write(base, "app/runtime-mode.json", { format: "quicker-agent-runtime-mode", version: 1, mode: otherMode });
    stageMinimalBundle(nested, runtimeMode);
    const app = { isPackaged: true, resourcesPath: base };
    assert.equal(resolveResourceRoot(app), base, "the opposing flat bundle is otherwise complete");
    assert.equal(isCompleteResourceRoot(base, { runtimeMode }), false);
    assert.equal(resolveResourceRoot(app, { runtimeMode }), nested, "every candidate must use the current shell's expected mode");
  });
}
