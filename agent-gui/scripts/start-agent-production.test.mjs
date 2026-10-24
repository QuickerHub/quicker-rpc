import assert from "node:assert/strict";
import fs, { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { parseAgentStartArguments, runAgentStart } from "./start-agent-production.mjs";

const temporaryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../.tmp/production-start-tests");

function fixture(t) {
  mkdirSync(temporaryRoot, { recursive: true });
  const root = mkdtempSync(join(temporaryRoot, "run-"));
  t.after(() => {
    assert.ok(resolve(root).startsWith(temporaryRoot + sep));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function write(app, file, content = "throw new Error('Fixture server must never actually import');\n") {
  const path = join(app, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
}

function stageStatic(app) {
  write(app, "runtime-manifest.json", { format: "quicker-agent-static-runtime", version: 1, next: false });
  for (const file of ["service.mjs", "lib/service-main.mjs", "renderer/index.html"]) write(app, file);
}

function dependencies(calls, returned = "loaded fixture") {
  return {
    environment: { NODE_ENV: "development", HOSTNAME: "fixture-host" },
    applyArguments(path, args) { calls.push(["arguments", path, args.slice()]); },
    async load(url) { calls.push(["load", url]); return returned; },
  };
}

test("start mode has a static production default", () => {
  assert.deepEqual(parseAgentStartArguments([]), { runtimeMode: "static", development: false, serviceArguments: [] });
});

test("default static startup forwards port zero and its explicit profile to the single service entry", async (t) => {
  const app = fixture(t), calls = [], profile = join(app, "generated-profile");
  stageStatic(app);
  write(app, "server.js");
  const argv = Object.freeze([`--app-dir=${app}`, "--host", "127.0.0.1", "--port", "0", "--data-dir", profile]);
  const processArguments = process.argv, processSnapshot = process.argv.slice();
  assert.equal(await runAgentStart(argv, dependencies(calls)), "loaded fixture");
  assert.deepEqual(calls, [["arguments", join(app, "service.mjs"), ["--host", "127.0.0.1", "--port", "0", "--data-dir", profile]], ["load", pathToFileURL(join(app, "service.mjs")).href]]);
  assert.deepEqual(argv, [`--app-dir=${app}`, "--host", "127.0.0.1", "--port", "0", "--data-dir", profile]);
  assert.strictEqual(process.argv, processArguments);
  assert.deepEqual(process.argv, processSnapshot);
});

test("development flags select only the existing Next HMR loader", async () => {
  const calls = [], before = process.argv.slice();
  const runtimeDependencies = dependencies(calls), environmentBefore = { ...runtimeDependencies.environment };
  await runAgentStart(["--dev", "--webpack", "--open-browser"], runtimeDependencies);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "load");
  assert.equal(fileURLToPath(calls[0][1]).split(/[\\/]/).at(-1), "start-next.mjs");
  assert.deepEqual(process.argv, before);
  assert.deepEqual(runtimeDependencies.environment, environmentBefore, "development HMR owns its existing environment");
});

test("explicit legacy startup uses server.js without requiring an old unmarked package to pretend it is static", async (t) => {
  const app = fixture(t), calls = [];
  write(app, "server.js");
  await runAgentStart(["--runtime=legacy-next", `--app-dir=${app}`], dependencies(calls));
  assert.deepEqual(calls, [["arguments", join(app, "server.js"), []], ["load", pathToFileURL(join(app, "server.js")).href]]);
});

test("legacy startup defaults to the complete staged app without probing raw Next standalone or ambient files", async (t) => {
  const agentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const app = join(agentRoot, "electron/resources/app"), marker = join(app, "runtime-mode.json"), server = join(app, "server.js");
  const calls = [], reads = [], probes = [], snapshot = process.argv.slice();
  const read = t.mock.method(fs, "readFileSync", (path, encoding) => {
    assert.equal(path, marker, "only the selected staged app mode may be read");
    assert.equal(encoding, "utf8");
    reads.push(path);
    return JSON.stringify({ format: "quicker-agent-runtime-mode", version: 1, mode: "legacy-next" });
  });
  const exists = t.mock.method(fs, "existsSync", (path) => {
    assert.ok(path === marker || path === server, `unexpected filesystem probe: ${path}`);
    probes.push(path);
    return true;
  });
  syncBuiltinESMExports();
  try {
    assert.equal(await runAgentStart(["--runtime=legacy-next"], dependencies(calls)), "loaded fixture");
    assert.deepEqual(calls, [["arguments", server, []], ["load", pathToFileURL(server).href]]);
    assert.deepEqual(reads, [marker]);
    assert.ok(probes.includes(server));
    assert.deepEqual(process.argv, snapshot);
  } finally {
    read.mock.restore();
    exists.mock.restore();
    syncBuiltinESMExports();
  }
});

for (const marked of [false, true]) {
  test(`${marked ? "marked" : "unmarked"} missing static output never loads a retained Next server or mutates argv`, async (t) => {
    const app = fixture(t), calls = [];
    write(app, "server.js");
    if (marked) write(app, "runtime-mode.json", { format: "quicker-agent-runtime-mode", version: 1, mode: "static" });
    const argv = Object.freeze([`--app-dir=${app}`, "--port", "0"]), snapshot = process.argv.slice();
    const runtimeDependencies = dependencies(calls), environmentBefore = { ...runtimeDependencies.environment };
    await assert.rejects(runAgentStart(argv, runtimeDependencies), (error) => {
      assert.ok(error.message.includes(join(app, "runtime-manifest.json")));
      assert.match(error.message, /pnpm build/);
      return true;
    });
    assert.deepEqual(calls, []);
    assert.deepEqual(argv, [`--app-dir=${app}`, "--port", "0"]);
    assert.deepEqual(process.argv, snapshot);
    assert.deepEqual(runtimeDependencies.environment, environmentBefore);
  });
}

for (const [recorded, requested] of [["static", "legacy-next"], ["legacy-next", "static"]]) {
  test(`requested ${requested} refuses a ${recorded} artifact without falling back to its leftover entry`, async (t) => {
    const app = fixture(t), calls = [];
    stageStatic(app);
    write(app, "server.js");
    write(app, "runtime-mode.json", { format: "quicker-agent-runtime-mode", version: 1, mode: recorded });
    const snapshot = process.argv.slice();
    const runtimeDependencies = dependencies(calls), environmentBefore = { ...runtimeDependencies.environment };
    await assert.rejects(runAgentStart([`--runtime=${requested}`, `--app-dir=${app}`], runtimeDependencies), /Requested .* selects/);
    assert.deepEqual(calls, []);
    assert.deepEqual(process.argv, snapshot);
    assert.deepEqual(runtimeDependencies.environment, environmentBefore);
  });
}

for (const argv of [["--runtime=auto"], ["--runtime=static", "--runtime=legacy-next"], ["--app-dir="], ["--app-dir=a", "--app-dir=b"], ["--unknown"], ["--port"], ["--dev", "--port", "0"], ["--dev", "--runtime=static"], ["--dev", "--app-dir=a"], ["--runtime=legacy-next", "--port", "0"], ["--webpack"]]) {
  test(`invalid start arguments cannot load a server or rewrite argv: ${argv.join(" ")}`, async () => {
    const calls = [], frozen = Object.freeze(argv.slice()), snapshot = process.argv.slice();
    const runtimeDependencies = dependencies(calls), environmentBefore = { ...runtimeDependencies.environment };
    await assert.rejects(runAgentStart(frozen, runtimeDependencies), /Unknown|Development HMR|Legacy Next/);
    assert.deepEqual(calls, []);
    assert.deepEqual(process.argv, snapshot);
    assert.deepEqual(frozen, argv);
    assert.deepEqual(runtimeDependencies.environment, environmentBefore);
  });
}

test("a failed static loader is propagated once rather than retrying a legacy server", async (t) => {
  const app = fixture(t), calls = [], failure = new Error("synthetic service import failure");
  stageStatic(app);
  write(app, "server.js");
  await assert.rejects(runAgentStart([`--app-dir=${app}`], {
    ...dependencies(calls),
    async load(url) { calls.push(["load", url]); throw failure; },
  }), (error) => error === failure);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.at(-1), ["load", pathToFileURL(join(app, "service.mjs")).href]);
});

for (const mode of ["static", "legacy-next"]) {
  test(`${mode} production startup overrides inherited development before applying arguments or importing`, async (t) => {
    const app = fixture(t), environment = { NODE_ENV: "development", HOSTNAME: "explicit-host", fixture: "preserved" }, phases = [];
    if (mode === "static") stageStatic(app);
    else write(app, "server.js");
    const processEnvironment = process.env.NODE_ENV;
    await runAgentStart([`--runtime=${mode}`, `--app-dir=${app}`], {
      environment,
      applyArguments() { assert.equal(environment.NODE_ENV, "production"); phases.push("arguments"); },
      async load() { assert.equal(environment.NODE_ENV, "production"); phases.push("load"); },
    });
    assert.deepEqual(phases, ["arguments", "load"]);
    assert.deepEqual(environment, { NODE_ENV: "production", HOSTNAME: "explicit-host", fixture: "preserved" });
    assert.equal(process.env.NODE_ENV, processEnvironment, "the injected environment isolates this test from process globals");
  });
}

for (const [inherited, expected] of [[undefined, "127.0.0.1"], ["", "127.0.0.1"], [" \t ", "127.0.0.1"], ["127.0.0.2", "127.0.0.2"], [" explicit-host ", "explicit-host"], ["::1", "::1"]]) {
  test(`explicit legacy startup normalizes its default host (${JSON.stringify(inherited)}) before import`, async (t) => {
    const app = fixture(t), environment = { NODE_ENV: "development", ...(inherited === undefined ? {} : { HOSTNAME: inherited }) };
    write(app, "server.js");
    await runAgentStart(["--runtime=legacy-next", `--app-dir=${app}`], {
      environment,
      applyArguments() {},
      async load() {
        assert.equal(environment.NODE_ENV, "production");
        assert.equal(environment.HOSTNAME, expected);
      },
    });
    assert.equal(environment.HOSTNAME, expected);
  });
}
