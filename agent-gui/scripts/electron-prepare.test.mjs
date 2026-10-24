import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseElectronPrepareArguments, prepareElectronBundle, runElectronPrepare } from "./electron-prepare.mjs";
import { prepareStaticElectronBundle } from "./electron-prepare-static.mjs";

const temporaryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp/electron-prepare-tests");
const manifest = { format: "quicker-agent-static-runtime", version: 1, next: false };

function fixture(t) {
  mkdirSync(temporaryRoot, { recursive: true });
  const repoRoot = mkdtempSync(join(temporaryRoot, "run-")), agentGuiRoot = join(repoRoot, "agent-gui");
  mkdirSync(agentGuiRoot);
  const packageData = { name: "isolated-prepare-fixture", version: "0.0.1", fixture: "preserved" };
  writeFileSync(join(agentGuiRoot, "package.json"), JSON.stringify(packageData));
  t.after(() => {
    assert.ok(resolve(repoRoot).startsWith(temporaryRoot + sep));
    rmSync(repoRoot, { recursive: true, force: true });
  });
  const resourcesDir = join(agentGuiRoot, "electron/resources");
  return { repoRoot, agentGuiRoot, resourcesDir, appDirectory: join(resourcesDir, "app"), packageData, qkrpcDirectory: "" };
}

function write(app, relative, content = "// synthetic fixture\n") {
  const path = join(app, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
}

function stageStatic(app) {
  write(app, "runtime-manifest.json", manifest);
  for (const file of ["service.mjs", "lib/service-main.mjs", "renderer/index.html"]) write(app, file);
}

function commonDependencies(calls, changes = {}) {
  return {
    async prepareStatic(ctx) { calls.push(["static", ctx]); },
    async prepareLegacy(ctx) { calls.push(["legacy-next", ctx]); },
    readVersion(root) { calls.push(["version", root]); return "0.0.2"; },
    syncPackageVersion(root, version) { calls.push(["sync", root, version]); },
    async generateAssets(options) { calls.push(["assets", options]); },
    stageShell(options) { calls.push(["shell", options]); return "synthetic-shell"; },
    ...changes,
  };
}

function staticDependencies(calls, changes = {}) {
  return {
    async buildProductionRuntime(options) { calls.push(["build", options]); stageStatic(options.outputDirectory); },
    prepareBundledLlmRuntime(path) { calls.push(["llm", path]); },
    prepareRemoteCipherPepper(path) { calls.push(["pepper", path]); },
    ensureBundledNode(ctx) { calls.push(["node", ctx]); },
    rebuildNative(...args) { calls.push(["native", ...args]); },
    ensureBundledRipgrep(ctx) { calls.push(["rg", ctx]); },
    stageQkrpcRuntime(ctx) { calls.push(["qkrpc", ctx]); },
    async verifyStaticRuntime(path, options) { calls.push(["verify", path, options]); },
    ...changes,
  };
}

for (const runtimeMode of [undefined, "static", "legacy-next"]) {
  test(`common prepare preserves version/assets/shell work for ${runtimeMode ?? "default static"}`, async (t) => {
    const f = fixture(t), calls = [], mode = runtimeMode ?? "static";
    const dependencies = commonDependencies(calls);
    delete dependencies.syncPackageVersion;
    const result = await prepareElectronBundle({ ...f, ...(runtimeMode ? { runtimeMode } : {}) }, dependencies);
    assert.deepEqual(calls.map(([step]) => step), [mode === "static" ? "static" : "legacy-next", "version", "assets", "shell"]);
    assert.equal(calls[0][1].agentGuiRoot, f.agentGuiRoot);
    assert.equal(calls[0][1].resourcesDir, f.resourcesDir);
    assert.deepEqual(calls.at(-2), ["assets", { regenFromSvg: false }]);
    assert.deepEqual(calls.at(-1), ["shell", { version: "0.0.2", runtimeMode: mode }]);
    assert.deepEqual(JSON.parse(readFileSync(join(f.agentGuiRoot, "package.json"), "utf8")), { ...f.packageData, version: "0.0.2" });
    assert.equal(result.mode, mode);
    assert.equal(result.shellDirectory, "synthetic-shell");
  });
}

test("common CLI defaults static and forwards explicit reuse to its selected prepare", async () => {
  const calls = [];
  await runElectronPrepare([], commonDependencies(calls));
  assert.equal(calls[0][0], "static");
  assert.equal(calls[0][1].reuseApp, false);
  calls.length = 0;
  await runElectronPrepare(["--runtime=legacy-next", "--reuse-app"], commonDependencies(calls));
  assert.equal(calls[0][0], "legacy-next");
  assert.equal(calls[0][1].reuseApp, true);
});

for (const argv of [["--runtime=auto"], ["--runtime="], ["--runtime=static", "--runtime=legacy-next"], ["--reuse-app", "--reuse-app"], ["--skip-build"], ["--runtime", "static"]]) {
  test(`invalid prepare arguments dispatch no stage/version/assets/shell work: ${argv.join(" ")}`, () => {
    const calls = [], frozen = Object.freeze(argv.slice());
    assert.throws(() => runElectronPrepare(frozen, commonDependencies(calls)), /Unknown|duplicate/);
    assert.deepEqual(calls, []);
    assert.deepEqual(frozen, argv);
  });
}

test("direct prepare rejects an invalid mode before version or staging", async (t) => {
  const f = fixture(t), calls = [];
  await assert.rejects(prepareElectronBundle({ ...f, runtimeMode: "next" }, commonDependencies(calls)), /Unknown Agent runtime mode/);
  assert.deepEqual(calls, []);
  assert.deepEqual(JSON.parse(readFileSync(join(f.agentGuiRoot, "package.json"), "utf8")), f.packageData);
});

for (const runtimeMode of ["static", "legacy-next"]) {
  test(`${runtimeMode} prepare failure cannot update version, assets or shell metadata`, async (t) => {
    const f = fixture(t), calls = [], failure = new Error("synthetic stage rejection");
    const selected = runtimeMode === "static" ? "prepareStatic" : "prepareLegacy";
    await assert.rejects(prepareElectronBundle({ ...f, runtimeMode }, commonDependencies(calls, {
      [selected]: async () => { calls.push(["failed stage"]); throw failure; },
    })), (error) => error === failure);
    assert.deepEqual(calls, [["failed stage"]]);
    assert.deepEqual(JSON.parse(readFileSync(join(f.agentGuiRoot, "package.json"), "utf8")), f.packageData);
  });
}

for (const [stage, reached] of [["readVersion", ["static"]], ["syncPackageVersion", ["static", "version"]], ["generateAssets", ["static", "version", "sync"]]]) {
  test(`${stage} failure stops later shared preparation`, async (t) => {
    const f = fixture(t), calls = [], failure = new Error(`synthetic ${stage} failure`);
    await assert.rejects(prepareElectronBundle(f, commonDependencies(calls, { [stage]: () => { throw failure; } })), (error) => error === failure);
    assert.deepEqual(calls.map(([step]) => step), reached);
  });
}

test("fresh static preparation uses the shared builder, verifies once and confirms the selected mode", async (t) => {
  const f = fixture(t), calls = [];
  const result = await prepareStaticElectronBundle(f, staticDependencies(calls, {
    async verifyStaticRuntime(path, options) {
      calls.push(["verify", path, options]);
    },
  }));
  assert.deepEqual(calls.map(([step]) => step), ["build", "llm", "pepper", "node", "native", "rg", "qkrpc", "verify"]);
  assert.deepEqual(calls[0][1], { outputDirectory: f.appDirectory, allowOutput: true });
  assert.deepEqual(calls.at(-1), ["verify", f.appDirectory, { nodeExecutable: join(f.resourcesDir, "node/node.exe"), desktop: true }]);
  assert.equal(JSON.parse(readFileSync(join(f.appDirectory, "runtime-mode.json"), "utf8")).mode, "static");
  assert.equal(result.mode, "static");
});

test("valid static reuse validates the actual artifact and never calls the builder", async (t) => {
  const f = fixture(t), calls = [];
  stageStatic(f.appDirectory);
  write(f.appDirectory, "server.js", "throw new Error('old Next entry must stay unused');");
  await prepareStaticElectronBundle({ ...f, reuseApp: true }, staticDependencies(calls, {
    buildProductionRuntime() { assert.fail("reuse cannot rebuild source"); },
  }));
  assert.deepEqual(calls.map(([step]) => step), ["llm", "pepper", "node", "native", "rg", "qkrpc", "verify"]);
  assert.equal(JSON.parse(readFileSync(join(f.appDirectory, "runtime-mode.json"), "utf8")).mode, "static");
});

for (const setup of [
  ["missing app", () => {}],
  ["only an old Next server", (app) => write(app, "server.js")],
  ["missing static service", (app) => write(app, "runtime-manifest.json", manifest)],
  ["explicit legacy marker", (app) => { stageStatic(app); write(app, "server.js"); write(app, "runtime-mode.json", { format: "quicker-agent-runtime-mode", version: 1, mode: "legacy-next" }); }],
]) {
  test(`invalid static reuse (${setup[0]}) reaches no tool/secret stage or common version work`, async (t) => {
    const f = fixture(t), calls = [];
    setup[1](f.appDirectory);
    const marker = join(f.appDirectory, "runtime-mode.json"), before = existsSync(marker) ? readFileSync(marker, "utf8") : null;
    const dependencies = commonDependencies(calls, { prepareStatic: prepareStaticElectronBundle, staticDependencies: staticDependencies(calls) });
    await assert.rejects(prepareElectronBundle({ ...f, reuseApp: true }, dependencies), /Static|static/);
    assert.deepEqual(calls, []);
    assert.equal(existsSync(marker) ? readFileSync(marker, "utf8") : null, before);
    assert.deepEqual(JSON.parse(readFileSync(join(f.agentGuiRoot, "package.json"), "utf8")), f.packageData);
  });
}

test("failed native verification preserves the previous static reuse stamp instead of writing success", async (t) => {
  const f = fixture(t), calls = [], failure = new Error("synthetic native probe failure");
  stageStatic(f.appDirectory);
  const marker = join(f.appDirectory, "runtime-mode.json");
  write(f.appDirectory, "runtime-mode.json", { format: "quicker-agent-runtime-mode", version: 1, mode: "static", fixture: "previous verified marker" });
  const before = readFileSync(marker, "utf8");
  await assert.rejects(prepareStaticElectronBundle({ ...f, reuseApp: true }, staticDependencies(calls, { verifyStaticRuntime: async () => { throw failure; } })), (error) => error === failure);
  assert.equal(readFileSync(marker, "utf8"), before);
});

test("fresh build failure never prepares secrets, tools or a runtime stamp", async (t) => {
  const f = fixture(t), calls = [], failure = new Error("synthetic static build failure");
  await assert.rejects(prepareStaticElectronBundle(f, staticDependencies(calls, { buildProductionRuntime: async () => { throw failure; } })), (error) => error === failure);
  assert.deepEqual(calls, []);
  assert.equal(existsSync(join(f.appDirectory, "runtime-mode.json")), false);
});
