import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { assertLocalAncestry, prepareGracefulExit, verifyPreparedPackage } from "./prepare-electron-graceful-exit.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
test("acceptance staging rejects unknown, occupied, outside and redirected output before copying", async () => {
  const root = mkdtempSync(join(repo, ".tmp/graceful-stage-policy-"));
  try {
    await assert.rejects(prepareGracefulExit(["--unexpected"]), /Unknown/);
    await assert.rejects(prepareGracefulExit([`--runtime-dir=${root}`, `--out=${root}`]), /fresh/);
    await assert.rejects(prepareGracefulExit([`--runtime-dir=${root}`, `--out=${join(repo, "unexpected-output")}`]), /fresh/);
    await assert.rejects(prepareGracefulExit([`--runtime-dir=${root}`, `--out=${join(root, "nested-output")}`]), /overlap/);
    const redirected = join(root, "redirected");
    symlinkSync(join(root, "real"), redirected, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => assertLocalAncestry(join(redirected, "new-child")), /Redirected/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("supplied bundle is copied unchanged except the documented fetch/config guard", async () => {
  const root = mkdtempSync(join(repo, ".tmp/graceful-stage-copy-")), source = join(root, "source"), output = join(root, "output");
  const keys = ["QUICKER_AGENT_SMOKE_ROOT", "QUICKER_AGENT_DATA_DIR", "QKRPC_HTTP_URL", "BUNDLED_LLM_REMOTE_CONFIG_DISABLED", "BUNDLED_LLM_CONFIG", "LLM_CONFIG_PATH"];
  const originalEnv = Object.fromEntries(keys.map(key => [key, process.env[key]])), originalFetch = globalThis.fetch;
  const originalStdout = process.stdout.write, originalStderr = process.stderr.write;
  try {
    for (const directory of ["resources/node", "resources/app/lib"]) mkdirSync(join(source, directory), { recursive: true });
    const fixtureFiles = { "quicker-agent.exe": "fixture PE, never executed", "resources/node/node.exe": "fixture Node, never executed", "resources/app.asar": "fixture ASAR, never executed",
      "resources/app/service.mjs": "// fixture service", "resources/app/lib/service-main.mjs": "// cleanup sentinel", "resources/app/runtime-manifest.json": "{}" };
    for (const [name, text] of Object.entries(fixtureFiles)) writeFileSync(join(source, name), text);
    const receipt = await prepareGracefulExit([`--runtime-dir=${source}`, `--out=${output}`, "--use-bundle"]);
    assert.equal(receipt.mode, "supplied-bundle");
    for (const [name, text] of Object.entries(fixtureFiles)) assert.equal(readFileSync(join(source, name), "utf8"), text, "source package is never mutated");
    const copied = join(output, "win-unpacked/resources/app");
    assert.ok(verifyPreparedPackage(join(output, "prepared.json")) > 0);
    const cleanup = join(copied, "lib/service-main.mjs");
    writeFileSync(cleanup, "// forbidden cleanup modification");
    assert.throws(() => verifyPreparedPackage(join(output, "prepared.json")), /contents changed/);
    writeFileSync(cleanup, fixtureFiles["resources/app/lib/service-main.mjs"]);
    const guard = join(copied, "acceptance-egress-guard.mjs"), guardBody = readFileSync(guard, "utf8");
    writeFileSync(guard, "// removed guard");
    assert.throws(() => verifyPreparedPackage(join(output, "prepared.json")), /contents changed/);
    writeFileSync(guard, guardBody);
    assert.ok(verifyPreparedPackage(join(output, "prepared.json")) > 0);
    assert.equal(readFileSync(join(copied, "lib/service-main.mjs"), "utf8"), fixtureFiles["resources/app/lib/service-main.mjs"]);
    assert.equal(readFileSync(join(copied, "service.acceptance-original.mjs"), "utf8"), fixtureFiles["resources/app/service.mjs"]);
    // Only the normal selected data directory is forwarded into the Node child.
    delete process.env.QUICKER_AGENT_SMOKE_ROOT;
    process.env.QUICKER_AGENT_DATA_DIR = join(root, "data");
    process.env.QKRPC_HTTP_URL = "http://127.0.0.1:45123";
    const allowedCalls = [];
    globalThis.fetch = async (input, options) => { assert.equal(options.redirect, "error"); allowedCalls.push(input); return "owned response"; };
    await import(pathToFileURL(join(copied, "acceptance-egress-guard.mjs")).href);
    assert.equal(await fetch("http://127.0.0.1:45123/health"), "owned response");
    assert.throws(() => fetch("http://127.0.0.1:9477/health"), /denied/);
    assert.throws(() => fetch("https://model.invalid/v1/chat"), /denied/);
    assert.deepEqual(allowedCalls, ["http://127.0.0.1:45123/health"]);
    assert.equal(process.env.BUNDLED_LLM_REMOTE_CONFIG_DISABLED, "1");
    assert.equal(process.env.BUNDLED_LLM_CONFIG, "{}");
    assert.equal(process.env.LLM_CONFIG_PATH, join(root, "absent-model-config.json"));
  } finally {
    globalThis.fetch = originalFetch;
    process.stdout.write = originalStdout; process.stderr.write = originalStderr;
    for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    rmSync(root, { recursive: true, force: true });
  }
});
