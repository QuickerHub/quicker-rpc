import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkStaticRuntimeClosure } from "./check-static-runtime-closure.mjs";
import { readRuntimeMode, RUNTIME_MODE_FILE, writeRuntimeMode } from "../../agent-gui/electron/runtime-mode.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function fixture(t) {
  const temporary = join(await realpath(repository), ".tmp");
  await mkdir(temporary, { recursive: true });
  const parent = await realpath(temporary);
  assert.equal(relative(temporary, parent), "", "test output must stay in this worktree's own temporary directory");
  const sandbox = await mkdtemp(join(parent, "closure-runner-test-"));
  const root = join(sandbox, "repository");
  await mkdir(root);
  t.after(async () => {
    const child = relative(parent, sandbox);
    assert.ok(child && !child.startsWith("..") && !child.includes(sep));
    await rm(sandbox, { recursive: true, force: true });
  });
  return { root, sandbox, inspectPaths: async () => {} };
}

async function fakeBuild({ development, outputDirectory }) {
  assert.equal(development, false);
  await mkdir(outputDirectory);
  await writeFile(join(outputDirectory, "fixture.txt"), "production fixture");
  writeRuntimeMode(outputDirectory, "static");
  return { appDirectory: outputDirectory, next: false };
}

async function receipts(root) {
  const directory = join(root, ".tmp/static-runtime-closure");
  return Promise.all((await readdir(directory)).map(async (name) => JSON.parse(await readFile(join(directory, name, "receipt.json"), "utf8"))));
}

test("a single production build is physically moved before the exact-Node non-desktop verification", async (t) => {
  const setup = await fixture(t);
  let built, builtMarker, builds = 0, verifications = 0;
  const result = await checkStaticRuntimeClosure({
    repositoryDirectory: setup.root, inspectPaths: setup.inspectPaths,
    build: async (options) => {
      builds++;
      built = options.outputDirectory;
      const report = await fakeBuild(options);
      builtMarker = await readFile(join(built, RUNTIME_MODE_FILE));
      return report;
    },
    verify: async (app, options) => {
      verifications++;
      assert.notEqual(app, built);
      assert.equal(existsSync(built), false, "the source cannot supply resources after relocation");
      assert.equal(await readFile(join(app, "fixture.txt"), "utf8"), "production fixture");
      const marker = await lstat(join(app, RUNTIME_MODE_FILE));
      assert.equal(marker.isSymbolicLink(), false);
      assert.equal(marker.isFile(), true);
      assert.equal(readRuntimeMode(app), "static");
      const relocatedMarker = await readFile(join(app, RUNTIME_MODE_FILE));
      assert.deepEqual(relocatedMarker, builtMarker);
      assert.equal(createHash("sha256").update(relocatedMarker).digest("hex"), createHash("sha256").update(builtMarker).digest("hex"));
      assert.deepEqual(options, { nodeExecutable: process.execPath, desktop: false });
      return { ok: true, checked: "fixture closure" };
    },
  });
  assert.equal(builds, 1);
  assert.equal(verifications, 1);
  assert.equal(result.ok, true);
  assert.equal(result.phase, "complete");
  assert.equal(result.buildEntry, "injected-build-port");
  assert.equal(result.runtimeModePreserved, true);
  assert.equal(result.runtimeMode.mode, "static");
  assert.equal(result.runtimeMode.sha256, createHash("sha256").update(builtMarker).digest("hex"));
  assert.deepEqual(await receipts(setup.root), [result]);
  assert.equal(existsSync(join(result.run, "failure.log")), false);
});

const markerFailure = /runtime.?mode|mode marker|static.*marker|marker.*(?:missing|invalid|unsupported|regular|symbolic|link|changed|match)/i;
for (const [name, change] of [
  ["missing", async (app) => {
    await rm(join(app, RUNTIME_MODE_FILE));
    assert.equal(readRuntimeMode(app), "static", "the shell's missing-marker default is not producer evidence");
  }],
  ["legacy mode", async (app) => { writeRuntimeMode(app, "legacy-next"); }],
  ["unsupported schema", async (app) => {
    await writeFile(join(app, RUNTIME_MODE_FILE), JSON.stringify({ format: "quicker-agent-runtime-mode", version: 2, mode: "static" }));
  }],
  ["oversized valid JSON", async (app) => {
    const path = join(app, RUNTIME_MODE_FILE);
    const content = await readFile(path, "utf8") + " ".repeat(4096);
    assert.equal(JSON.parse(content).mode, "static");
    assert.ok(Buffer.byteLength(content) > 4096);
    await writeFile(path, content);
  }],
  ["linked", async (app) => {
    const target = join(app, "marker-target");
    await mkdir(target);
    await rm(join(app, RUNTIME_MODE_FILE));
    await symlink(target, join(app, RUNTIME_MODE_FILE), process.platform === "win32" ? "junction" : "dir");
  }],
]) test(`the ${name} runtime mode marker is rejected before moving or verifying the artifact`, async (t) => {
  const setup = await fixture(t);
  let verifications = 0;
  await assert.rejects(checkStaticRuntimeClosure({
    repositoryDirectory: setup.root, inspectPaths: setup.inspectPaths,
    build: async (options) => {
      const report = await fakeBuild(options);
      await change(options.outputDirectory);
      return report;
    },
    verify: async () => { verifications++; return { ok: true }; },
  }), markerFailure);
  const [receipt] = await receipts(setup.root);
  assert.equal(verifications, 0);
  assert.equal(receipt.ok, false);
  assert.notEqual(receipt.phase, "complete");
  assert.equal(existsSync(join(receipt.builtApp, "fixture.txt")), true);
  assert.equal(existsSync(receipt.relocatedApp), false);
  assert.match(await readFile(join(receipt.run, "failure.log"), "utf8"), markerFailure);
});

test("exact marker metadata rejection precedes parsing and preserves the original error", async (t) => {
  const setup = await fixture(t);
  const failure = new Error("synthetic marker metadata rejection");
  let marker, verifications = 0;
  await assert.rejects(checkStaticRuntimeClosure({
    repositoryDirectory: setup.root,
    inspectPaths: async (paths) => { if (marker && paths.includes(marker)) throw failure; },
    build: async (options) => {
      const report = await fakeBuild(options);
      marker = join(options.outputDirectory, RUNTIME_MODE_FILE);
      await writeFile(marker, "invalid JSON that must not be parsed before metadata");
      return report;
    },
    verify: async () => { verifications++; return { ok: true }; },
  }), (error) => error === failure);
  const [receipt] = await receipts(setup.root);
  assert.equal(verifications, 0);
  assert.equal(receipt.ok, false);
  assert.notEqual(receipt.phase, "complete");
  assert.equal(existsSync(join(receipt.builtApp, "fixture.txt")), true);
  assert.equal(existsSync(receipt.relocatedApp), false);
  assert.match(await readFile(join(receipt.run, "failure.log"), "utf8"), /synthetic marker metadata rejection/);
});

test("a marker byte change after relocation remains blocking even when it still declares static mode", async (t) => {
  const setup = await fixture(t);
  let verifications = 0;
  await assert.rejects(checkStaticRuntimeClosure({
    repositoryDirectory: setup.root, inspectPaths: setup.inspectPaths, build: fakeBuild,
    verify: async (app) => {
      verifications++;
      const path = join(app, RUNTIME_MODE_FILE);
      await writeFile(path, Buffer.concat([await readFile(path), Buffer.from("\n")]));
      assert.equal(readRuntimeMode(app), "static");
      return { ok: true };
    },
  }), markerFailure);
  const [receipt] = await receipts(setup.root);
  assert.equal(verifications, 1);
  assert.equal(receipt.ok, false);
  assert.notEqual(receipt.phase, "complete");
  assert.equal(existsSync(receipt.builtApp), false);
  assert.equal(existsSync(join(receipt.relocatedApp, "fixture.txt")), true);
  assert.match(await readFile(join(receipt.run, "failure.log"), "utf8"), markerFailure);
});

test("a verifier rejection stays blocking and leaves the moved artifact plus precise failure evidence", async (t) => {
  const setup = await fixture(t);
  const failure = new Error("fixture dependency resolved outside relocated runtime");
  await assert.rejects(checkStaticRuntimeClosure({
    repositoryDirectory: setup.root, inspectPaths: setup.inspectPaths, build: fakeBuild,
    verify: async () => { throw failure; },
  }), (error) => error === failure);
  const [receipt] = await receipts(setup.root);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.phase, "verify");
  assert.equal(existsSync(receipt.builtApp), false);
  assert.equal(existsSync(receipt.relocatedApp), true);
  assert.match(await readFile(join(receipt.run, "failure.log"), "utf8"), /resolved outside relocated runtime/);
});

test("a build failure never verifies a partial artifact or removes its evidence", async (t) => {
  const setup = await fixture(t);
  let verifications = 0;
  await assert.rejects(checkStaticRuntimeClosure({
    repositoryDirectory: setup.root, inspectPaths: setup.inspectPaths,
    build: async (options) => { await fakeBuild(options); throw new Error("synthetic build rejection"); },
    verify: async () => { verifications++; return { ok: true }; },
  }), /synthetic build rejection/);
  const [receipt] = await receipts(setup.root);
  assert.equal(verifications, 0);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.phase, "build");
  assert.equal(existsSync(join(receipt.builtApp, "fixture.txt")), true);
  assert.equal(existsSync(receipt.relocatedApp), false);
});

test("a redirected temporary root cannot write to a neighboring directory", async (t) => {
  const setup = await fixture(t);
  const outside = join(setup.sandbox, "neighbor");
  await mkdir(outside);
  await writeFile(join(outside, "keep.txt"), "preserve");
  await symlink(outside, join(setup.root, ".tmp"), process.platform === "win32" ? "junction" : "dir");
  let builds = 0;
  await assert.rejects(checkStaticRuntimeClosure({
    repositoryDirectory: setup.root, inspectPaths: setup.inspectPaths,
    build: async () => { builds++; throw new Error("must not build"); },
  }), /redirected/);
  assert.equal(builds, 0);
  assert.deepEqual(await readdir(outside), ["keep.txt"]);
  assert.equal(await readFile(join(outside, "keep.txt"), "utf8"), "preserve");
});

test("placeholder metadata rejection happens before temporary-directory creation or build", async (t) => {
  const setup = await fixture(t);
  let builds = 0;
  await assert.rejects(checkStaticRuntimeClosure({
    repositoryDirectory: setup.root,
    inspectPaths: async (paths) => { if (paths.includes(join(setup.root, ".tmp"))) throw new Error("synthetic cloud recall placeholder"); },
    build: async () => { builds++; throw new Error("must not build"); },
  }), /cloud recall placeholder/);
  assert.equal(builds, 0);
  assert.equal(existsSync(join(setup.root, ".tmp")), false);
});

test("a mismatched builder result cannot redirect verification to an unrelated artifact", async (t) => {
  const setup = await fixture(t);
  let verifications = 0;
  await assert.rejects(checkStaticRuntimeClosure({
    repositoryDirectory: setup.root, inspectPaths: setup.inspectPaths,
    build: async (options) => ({ ...await fakeBuild(options), appDirectory: setup.sandbox }),
    verify: async () => { verifications++; return { ok: true }; },
  }), /different artifact directory/);
  assert.equal(verifications, 0);
  const [receipt] = await receipts(setup.root);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.phase, "build");
});
