import assert from "node:assert/strict";
import fs, { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import test from "node:test";
import { resolveRuntimeEntry } from "./runtime-entry.mjs";

const temporaryRoot = resolve(import.meta.dirname, "../../.tmp/electron-runtime-entry-tests");
const modeFile = "runtime-mode.json";
const modeMarker = (mode) => ({ format: "quicker-agent-runtime-mode", version: 1, mode });
const staticManifest = { format: "quicker-agent-static-runtime", version: 1, next: false };

function fixture(t) {
  mkdirSync(temporaryRoot, { recursive: true });
  const root = mkdtempSync(join(temporaryRoot, "run-"));
  t.after(() => {
    assert.ok(resolve(root).startsWith(temporaryRoot + sep));
    rmSync(root, { recursive: true, force: true });
  });
  return join(root, "app");
}

function write(app, file, content = "// generated fixture\n") {
  const path = join(app, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
}

function stageStatic(app) {
  write(app, "runtime-manifest.json", staticManifest);
  for (const file of ["service.mjs", "lib/service-main.mjs", "renderer/index.html"]) write(app, file);
}

test("an unmarked complete static runtime is the production default", (t) => {
  const app = fixture(t);
  stageStatic(app);
  assert.deepEqual(resolveRuntimeEntry(app), { kind: "static", path: join(app, "service.mjs") });
});

test("a static overlay selects service.mjs even when the old Next entry remains", (t) => {
  const app = fixture(t);
  stageStatic(app);
  write(app, modeFile, modeMarker("static"));
  write(app, "server.js");
  assert.deepEqual(resolveRuntimeEntry(app), { kind: "static", path: join(app, "service.mjs") });
});

test("an explicit legacy overlay selects server.js even when the old static manifest remains", (t) => {
  const app = fixture(t);
  stageStatic(app);
  write(app, modeFile, modeMarker("legacy-next"));
  write(app, "server.js");
  assert.deepEqual(resolveRuntimeEntry(app), { kind: "legacy-next", path: join(app, "server.js") });
  write(app, "runtime-manifest.json", "{stale and invalid static manifest");
  assert.deepEqual(resolveRuntimeEntry(app), { kind: "legacy-next", path: join(app, "server.js") }, "legacy mode must not depend on stale static metadata");
});

for (const marked of [false, true]) {
  test(`${marked ? "marked" : "unmarked"} static never falls back to an existing Next server when its manifest is missing`, (t) => {
    const app = fixture(t);
    write(app, "server.js");
    write(app, "service.mjs");
    if (marked) write(app, modeFile, modeMarker("static"));
    assert.throws(() => resolveRuntimeEntry(app), /runtime-manifest\.json/, "a missing static build must produce a static diagnostic");
  });
}

for (const missing of ["service.mjs", "lib/service-main.mjs", "renderer/index.html"]) {
  test(`static mode rejects missing ${missing} even with an old Next server`, (t) => {
    const app = fixture(t);
    stageStatic(app);
    write(app, modeFile, modeMarker("static"));
    write(app, "server.js");
    rmSync(join(app, missing));
    assert.throws(() => resolveRuntimeEntry(app), (error) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.replaceAll("\\", "/").includes(missing), error.message);
      return true;
    });
  });
}

test("explicit legacy mode requires server.js rather than using remaining static files", (t) => {
  const app = fixture(t);
  stageStatic(app);
  write(app, modeFile, modeMarker("legacy-next"));
  assert.throws(() => resolveRuntimeEntry(app), /server\.js/);
});

test("invalid static manifests cannot fall back to a retained Next entry", (t) => {
  const app = fixture(t);
  stageStatic(app);
  write(app, "server.js");
  for (const content of ["{broken", "null", "[]", { ...staticManifest, format: "other" }, { ...staticManifest, version: 2 }, { ...staticManifest, next: true }]) {
    write(app, "runtime-manifest.json", content);
    assert.throws(() => resolveRuntimeEntry(app), Error, `invalid static manifest: ${JSON.stringify(content)}`);
  }
});

test("invalid runtime mode markers fail with the marker path instead of selecting either retained runtime", (t) => {
  const app = fixture(t);
  stageStatic(app);
  write(app, "server.js");
  for (const content of ["{broken", "null", "[]", { ...modeMarker("static"), format: "other" }, { ...modeMarker("static"), version: 2 }, { format: "quicker-agent-runtime-mode", version: 1 }, modeMarker("next")]) {
    write(app, modeFile, content);
    assert.throws(() => resolveRuntimeEntry(app), (error) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(join(app, modeFile)), error.message);
      return true;
    }, `invalid marker: ${JSON.stringify(content)}`);
  }
});

test("runtime mode normalization has an explicit static default and rejects unknown modes", async () => {
  const { RUNTIME_MODE_FILE, normalizeRuntimeMode } = await import("./runtime-mode.mjs");
  assert.equal(RUNTIME_MODE_FILE, modeFile);
  assert.equal(normalizeRuntimeMode(undefined), "static");
  assert.equal(normalizeRuntimeMode("static"), "static");
  assert.equal(normalizeRuntimeMode("legacy-next"), "legacy-next");
  for (const value of ["", "auto", "next", null, 1, {}]) assert.throws(() => normalizeRuntimeMode(value), Error);
});

test("runtime mode stamps round-trip both overlay directions without altering other application files", async (t) => {
  const app = fixture(t);
  mkdirSync(app, { recursive: true });
  const { readRuntimeMode, writeRuntimeMode } = await import("./runtime-mode.mjs");
  assert.equal(readRuntimeMode(app), "static");
  write(app, "sentinel", "preserved");
  for (const mode of ["legacy-next", "static", "legacy-next"]) {
    writeRuntimeMode(app, mode);
    assert.equal(readRuntimeMode(app), mode);
    assert.deepEqual(JSON.parse(readFileSync(join(app, modeFile), "utf8")), modeMarker(mode));
    assert.equal(readFileSync(join(app, "sentinel"), "utf8"), "preserved");
    assert.deepEqual(readdirSync(app).sort(), [modeFile, "sentinel"].sort(), "successful atomic stamps leave no temporary sibling files");
  }
  const before = readFileSync(join(app, modeFile), "utf8");
  assert.throws(() => writeRuntimeMode(app, "auto"), Error);
  assert.equal(readFileSync(join(app, modeFile), "utf8"), before, "an invalid selection cannot replace the last valid runtime mode");
});

test("a failed atomic mode replacement preserves the previous selected runtime and can be retried", async (t) => {
  const app = fixture(t);
  mkdirSync(app, { recursive: true });
  const { readRuntimeMode, writeRuntimeMode } = await import("./runtime-mode.mjs");
  writeRuntimeMode(app, "legacy-next");
  const before = readFileSync(join(app, modeFile), "utf8");
  const replacement = t.mock.method(fs, "renameSync", () => { throw new Error("synthetic mode replacement failure"); });
  syncBuiltinESMExports();
  try {
    assert.throws(() => writeRuntimeMode(app, "static"), /synthetic mode replacement failure/);
    assert.equal(readFileSync(join(app, modeFile), "utf8"), before);
    assert.equal(readRuntimeMode(app), "legacy-next");
  } finally {
    replacement.mock.restore();
    syncBuiltinESMExports();
  }
  writeRuntimeMode(app, "static");
  assert.equal(readRuntimeMode(app), "static");
});

test("the current shell defaults to static independently of a retained legacy resource marker", async (t) => {
  const shell = fixture(t);
  const { readShellRuntimeMode } = await import("./runtime-mode.mjs");
  write(shell, "package.json", { name: "fixture-current-shell", version: "1.0.0" });
  write(shell, "resources/app/runtime-mode.json", modeMarker("legacy-next"));
  assert.equal(readShellRuntimeMode(shell), "static");
});

for (const mode of ["static", "legacy-next"]) {
  test(`the current shell explicitly selects ${mode} independently of retained resource metadata`, async (t) => {
    const shell = fixture(t);
    const { readShellRuntimeMode } = await import("./runtime-mode.mjs");
    write(shell, "package.json", { quickerAgentRuntimeMode: mode });
    write(shell, "resources/app/runtime-mode.json", modeMarker(mode === "static" ? "legacy-next" : "static"));
    assert.equal(readShellRuntimeMode(shell), mode);
  });
}

test("invalid shell mode metadata fails with the current package path rather than assuming static", async (t) => {
  const shell = fixture(t);
  const { readShellRuntimeMode } = await import("./runtime-mode.mjs");
  const rejectsWithPackagePath = () => assert.throws(() => readShellRuntimeMode(shell), (error) => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes(join(shell, "package.json")), error.message);
    return true;
  });
  rejectsWithPackagePath(); // A missing package is different from a package without the optional field.
  for (const content of ["{broken", "null", "[]", { quickerAgentRuntimeMode: null }, { quickerAgentRuntimeMode: "" }, { quickerAgentRuntimeMode: "next" }, { quickerAgentRuntimeMode: false }]) {
    write(shell, "package.json", content);
    rejectsWithPackagePath();
  }
});

for (const mode of ["static", "legacy-next"]) {
  test(`the shell's expected ${mode} rejects an opposing resource marker even when both entries exist`, (t) => {
    const app = fixture(t);
    const recorded = mode === "static" ? "legacy-next" : "static";
    stageStatic(app);
    write(app, "server.js");
    write(app, modeFile, modeMarker(recorded));
    assert.equal(resolveRuntimeEntry(app).kind, recorded, "generic tools retain marker-aware selection");
    assert.throws(() => resolveRuntimeEntry(app, { mode }), (error) => {
      assert.ok(error instanceof Error);
      for (const detail of [mode, recorded, join(app, modeFile)]) assert.ok(error.message.includes(detail), error.message);
      return true;
    });
  });
}
