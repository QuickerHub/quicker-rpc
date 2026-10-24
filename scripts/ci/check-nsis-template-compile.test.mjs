import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import promises from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(new URL("../../agent-gui/package.json", import.meta.url));
let subject;

function forbidCalls(t, object, names, prefix, calls) {
  return names.map((name) => t.mock.method(object, name, () => {
    calls.push(`${prefix}.${name}`);
    throw new Error(`Forbidden test side effect: ${prefix}.${name}`);
  }));
}

function restoreMocks(mocks) {
  for (const mock of mocks.reverse()) mock.mock.restore();
  syncBuiltinESMExports();
}

function pinnedBuilder() {
  // The public entry initializes the pinned builder's circular imports.
  require("electron-builder");
  assert.equal(require("app-builder-lib/package.json").version, "25.1.8");
  return {
    Target: require("app-builder-lib/out/targets/nsis/NsisTarget.js").NsisTarget,
    reader: require("app-builder-lib/out/targets/nsis/nsisUtil.js").UninstallerReader.exec,
  };
}

test("importing the compile CLI does not write, download, spawn or select a signing environment", async (t) => {
  const calls = [];
  const environmentNames = ["ELECTRON_BUILDER_CACHE", "CSC_IDENTITY_AUTO_DISCOVERY"];
  const environment = environmentNames.map((name) => process.env[name]);
  const originalExitCode = process.exitCode;
  const mocks = [
    ...forbidCalls(t, childProcess, ["exec", "execFile", "execFileSync", "execSync", "fork", "spawn", "spawnSync"], "child_process", calls),
    ...forbidCalls(t, fs, ["mkdirSync", "mkdtempSync", "writeFileSync", "appendFileSync", "copyFileSync", "cpSync", "renameSync", "rmSync"], "fs", calls),
    ...forbidCalls(t, promises, ["realpath", "mkdir", "mkdtemp", "writeFile", "appendFile", "copyFile", "cp", "rename", "rm"], "fs.promises", calls),
    ...forbidCalls(t, http, ["request", "get"], "http", calls),
    ...forbidCalls(t, https, ["request", "get"], "https", calls),
    ...forbidCalls(t, globalThis, ["fetch"], "global", calls),
  ];
  syncBuiltinESMExports();
  try {
    subject = await import("./check-nsis-template-compile.mjs");
    await new Promise((done) => setImmediate(done));
    assert.equal(typeof subject.checkNsisTemplateCompile, "function");
    assert.deepEqual(calls, []);
    assert.equal(process.exitCode, originalExitCode);
    for (const [index, name] of environmentNames.entries()) {
      assert.ok(process.env[name] === environment[index], `${name} changed during import`);
    }
  } finally {
    restoreMocks(mocks);
  }
});

test("compile outputs must be strict absolute descendants of their fixture root", () => {
  const root = resolve(repository, ".tmp", "nsis-output-boundary-fixture");
  const output = join(root, "output", "compile-only-setup.exe");
  assert.equal(subject.assertCompileOutput(root, output), output);
  for (const path of [
    `${root}-neighbor${sep}compile-only-setup.exe`,
    "output/compile-only-setup.exe",
    parse(root).root,
    root,
    dirname(root),
    resolve(root, "..", "outside.exe"),
  ]) {
    assert.throws(() => subject.assertCompileOutput(root, path), /escaped its fresh fixture directory/, path);
  }
});

test("the CLI returns exit code 1 when its platform cannot compile Windows installers", () => {
  const script = new URL("./check-nsis-template-compile.mjs", import.meta.url);
  const source = `
    Object.defineProperty(process, "platform", { value: "unsupported-ci-platform" });
    process.argv[1] = ${JSON.stringify(fileURLToPath(script))};
    await import(${JSON.stringify(script.href)});
  `;
  const result = childProcess.spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: repository,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Real NSIS template compilation requires Windows/);
});

test("unused-function controls accept the exact NSIS warning and reject unrelated diagnostics", () => {
  for (const phase of ["install", "uninstall"]) {
    assert.equal(subject.hasUnusedFunctionWarning(`Compiler failed\nwarning 6010: ${phase} function "StrContains" not referenced - zeroing code\n`, "StrContains"), true);
  }
  for (const diagnostic of [
    'warning 6010: install function "Unrelated" not referenced\nOutFile: "fixture/StrContains.exe"',
    'warning 6010: uninstall function "Unrelated" not referenced\nError: fixture/handleUninstallResult.nsi',
    'Error 6010: install function "StrContains" not referenced',
    'warning 6011: install function "StrContains" not referenced',
    'warning 6010: install function "StrContainsNeighbor" not referenced',
    'warning 6010:\ninstall function "StrContains" not referenced',
    'OutFile: "fixture/StrContains.exe"\nError: command failed with exit code 1',
  ]) {
    assert.equal(subject.hasUnusedFunctionWarning(diagnostic, "StrContains"), false, diagnostic);
    assert.equal(subject.hasUnusedFunctionWarning(diagnostic, "handleUninstallResult"), false, diagnostic);
  }
});

test("changed upstream handoff and reader hashes are rejected before replacing the real Target method", () => {
  const { Target, reader } = pinnedBuilder();
  const original = Target.prototype.computeScriptAndSignUninstaller;
  const ports = {
    readScript() { throw new Error("must not read a script"); },
    extractUninstaller: reader,
    assertOutput() { throw new Error("must not inspect output"); },
    recordExtraction() { throw new Error("must not record extraction"); },
  };
  class ChangedTarget extends Target {}
  const changed = async function changedHandoff() { throw new Error("must not run a changed handoff"); };
  ChangedTarget.prototype.computeScriptAndSignUninstaller = changed;
  assert.throws(() => subject.installCompileOnlyHandoff(ChangedTarget, ports), /Pinned NSIS compile handoff\/reader changed/);
  assert.equal(ChangedTarget.prototype.computeScriptAndSignUninstaller, changed);
  assert.throws(() => subject.installCompileOnlyHandoff(Target, {
    ...ports,
    extractUninstaller: async function changedReader() { throw new Error("must not run a changed reader"); },
  }), /Pinned NSIS compile handoff\/reader changed/);
  assert.equal(Target.prototype.computeScriptAndSignUninstaller, original);
});

test("warningsAsErrors=false is rejected before script reads, compilation or signer replacement", async () => {
  const { Target, reader } = pinnedBuilder();
  const original = Target.prototype.computeScriptAndSignUninstaller;
  const sign = async () => { throw new Error("must not sign"); };
  const packager = { sign };
  const calls = [];
  const handoff = subject.installCompileOnlyHandoff(Target, {
    readScript() { calls.push("script"); throw new Error("must not read a script"); },
    extractUninstaller: reader,
    assertOutput() { calls.push("path"); throw new Error("must not inspect output"); },
    recordExtraction() { calls.push("extraction"); throw new Error("must not record extraction"); },
  });
  try {
    await assert.rejects(Target.prototype.computeScriptAndSignUninstaller.call({
      options: { warningsAsErrors: false }, packager,
      executeMakensis() { calls.push("compiler"); throw new Error("must not compile"); },
    }, {}, {}, resolve("unused-fixture.exe"), "", new Map()), /default template and \/WX/);
    assert.deepEqual(calls, []);
    assert.equal(packager.sign, sign);
  } finally {
    handoff.restore();
  }
  assert.equal(Target.prototype.computeScriptAndSignUninstaller, original);
  assert.equal(packager.sign, sign);
});

test("invalid compiler PE output fails through the real reader without execution fallback and restores ownership", async (t) => {
  const { Target, reader } = pinnedBuilder();
  const original = Target.prototype.computeScriptAndSignUninstaller;
  const temporary = join(repository, ".tmp");
  await promises.mkdir(temporary, { recursive: true });
  const root = await promises.mkdtemp(join(temporary, "nsis-handoff-test-"));
  t.after(async () => {
    const suffix = relative(temporary, root);
    assert.ok(suffix && !suffix.startsWith("..") && !suffix.includes(sep));
    await promises.rm(root, { recursive: true, force: true });
  });
  const installer = join(root, "invalid-compiler-output.exe");
  const assertOutput = (path) => subject.assertCompileOutput(root, path);
  const attempts = [];
  const processMocks = forbidCalls(t, childProcess, ["exec", "execFile", "execFileSync", "execSync", "fork", "spawn", "spawnSync"], "child_process", attempts);
  syncBuiltinESMExports();
  let signerCalls = 0, vmCalls = 0, compilerCalls = 0, recorded = 0;
  const sign = async () => { signerCalls++; throw new Error("must not discover or call a signer"); };
  const packager = {
    sign,
    get vm() { vmCalls++; throw new Error("must not fall back to executing a PE"); },
  };
  const script = await promises.readFile(require.resolve("app-builder-lib/templates/nsis/installer.nsi"), "utf8");
  const handoff = subject.installCompileOnlyHandoff(Target, {
    readScript: async () => script,
    extractUninstaller: reader,
    assertOutput,
    recordExtraction() { recorded++; },
  });
  try {
    await assert.rejects(Target.prototype.computeScriptAndSignUninstaller.call({
      options: { warningsAsErrors: true }, outDir: root, packager,
      async computeFinalScript(input, isInstaller) {
        assert.equal(input, script);
        assert.equal(isInstaller, false);
        return input;
      },
      async executeMakensis(defines) {
        compilerCalls++;
        assert.ok("BUILD_UNINSTALLER" in defines);
        assert.equal(defines.UNINSTALLER_OUT_FILE, join(root, "compile-only-uninstaller.exe"));
        assert.notEqual(packager.sign, sign);
        await packager.sign(installer);
        await promises.writeFile(installer, Buffer.from("Invalid PE fixture: never execute"));
      },
    }, {}, {}, installer, "; fixture header\n", new Map()), /Invalid 'MZ' signature/);
    assert.equal(compilerCalls, 1);
    assert.equal(recorded, 0);
    assert.equal(signerCalls, 0);
    assert.equal(vmCalls, 0);
    assert.deepEqual(attempts, []);
    await assert.rejects(promises.access(join(root, "compile-only-uninstaller.exe")), { code: "ENOENT" });
  } finally {
    handoff.restore();
    restoreMocks(processMocks);
  }
  assert.equal(Target.prototype.computeScriptAndSignUninstaller, original);
  assert.equal(packager.sign, sign);
});
