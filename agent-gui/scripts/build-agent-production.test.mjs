import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildAgentProductionRuntime, parseProductionBuildArguments } from "./build-agent-production.mjs";

const agentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = resolve(agentRoot, "../.tmp/production-builder-tests");

function fixture(t) {
  mkdirSync(temporaryRoot, { recursive: true });
  const directory = mkdtempSync(join(temporaryRoot, "run-"));
  t.after(() => {
    assert.ok(resolve(directory).startsWith(temporaryRoot + sep));
    rmSync(directory, { recursive: true, force: true });
  });
  return join(directory, "app");
}

test("default production checks docs, the service manifest and standalone types before building once", async (t) => {
  const appDirectory = fixture(t), calls = [];
  const options = Object.freeze({ outputDirectory: appDirectory, allowOutput: true });
  const report = { appDirectory, next: false, fixture: "preserved report" };
  const actual = await buildAgentProductionRuntime(options, {
    run(command, args, configuration) { calls.push({ command, args, configuration }); },
    async buildStaticRuntime(received) {
      assert.strictEqual(received, options);
      assert.equal(calls.length, 3);
      assert.equal(existsSync(join(appDirectory, "runtime-mode.json")), false);
      mkdirSync(appDirectory);
      calls.push({ build: true });
      return report;
    },
  });
  assert.strictEqual(actual, report);
  assert.deepEqual(calls.slice(0, 3).map(({ args }) => args.slice(1)), [[], ["--check"], ["--noEmit", "--incremental", "false"]]);
  assert.deepEqual(calls.slice(0, 3).map(({ args }) => args[0].replaceAll("\\", "/").split("/").at(-1)), ["generate-authoring-docs.mjs", "generate-service-routes.mjs", "tsc.js"]);
  for (const call of calls.slice(0, 3)) {
    assert.equal(call.command, process.execPath);
    assert.equal(call.configuration.cwd, agentRoot);
  }
  assert.equal(calls.length, 4);
  assert.deepEqual(JSON.parse(readFileSync(join(appDirectory, "runtime-mode.json"), "utf8")), { format: "quicker-agent-runtime-mode", version: 1, mode: "static" });
});

for (const [failureIndex, check] of ["docs generation", "service route manifest", "TypeScript"].entries()) {
  test(`${check} failure prevents the static build and runtime stamp`, async (t) => {
    const appDirectory = fixture(t), calls = [], failure = new Error(`synthetic ${check} failure`);
    await assert.rejects(buildAgentProductionRuntime({ outputDirectory: appDirectory }, {
      run(_command, args) {
        calls.push(args);
        if (calls.length - 1 === failureIndex) throw failure;
      },
      buildStaticRuntime() { assert.fail("a failed prerequisite cannot build an app"); },
    }), (error) => error === failure);
    assert.equal(calls.length, failureIndex + 1);
    assert.equal(existsSync(appDirectory), false);
  });
}

test("a rejected static build is propagated without recording a successful runtime mode", async (t) => {
  const appDirectory = fixture(t), failure = new Error("synthetic renderer failure");
  mkdirSync(appDirectory);
  let checks = 0;
  await assert.rejects(buildAgentProductionRuntime({ outputDirectory: appDirectory }, {
    run() { checks += 1; },
    async buildStaticRuntime() { throw failure; },
  }), (error) => error === failure);
  assert.equal(checks, 3);
  assert.equal(existsSync(join(appDirectory, "runtime-mode.json")), false);
});

test("production CLI arguments preserve the requested output without mutating the caller", () => {
  assert.deepEqual(parseProductionBuildArguments([]), {});
  const argv = Object.freeze(["--out=.tmp/isolated-runtime", "--allow-output"]);
  assert.deepEqual(parseProductionBuildArguments(argv), { outputDirectory: ".tmp/isolated-runtime", allowOutput: true });
  assert.deepEqual(argv, ["--out=.tmp/isolated-runtime", "--allow-output"]);
});

for (const argv of [["--dev"], ["--runtime=legacy-next"], ["--out="], ["--out=a", "--out=b"], ["--allow-output", "--allow-output"]]) {
  test(`production CLI rejects unknown or duplicate arguments ${argv.join(" ")}`, () => {
    assert.throws(() => parseProductionBuildArguments(Object.freeze(argv)), /Unknown production build argument/);
  });
}
