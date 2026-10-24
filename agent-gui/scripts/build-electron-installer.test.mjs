import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { parseInstallerArguments, runElectronInstaller, verifyInstallerPayloadPaths } from "./build-electron-installer.mjs";

const root = resolve(import.meta.dirname, ".."), require = createRequire(import.meta.url);
test("the real pinned builder API initializes without the NsisTarget circular-import failure", () => {
  const child = spawnSync(process.execPath, ["--import", "./scripts/agent-offline-network-guard.mjs", "--input-type=module", "-e",
    "import {loadInstallerBuildApi} from './scripts/build-electron-installer.mjs'; const {api,Target}=loadInstallerBuildApi(); console.log(typeof api.build+':'+typeof Target.prototype.computeFinalScript);"],
    { cwd: root, windowsHide: true, timeout: 10000, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr); assert.equal(child.stdout.trim(), "function:function");
});
test("both actual packaging entrances use one owned adapter and preserve output arguments", async () => {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const publish = await readFile(join(root, "../publish/Publish-QuickerAgent.ps1"), "utf8");
  assert.match(pkg.scripts["electron:build"], /node scripts\/build-electron-installer\.mjs --win nsis/);
  assert.match(publish, /node scripts\/build-electron-installer\.mjs --win nsis \$electronOutputArg/);
  assert.doesNotMatch(publish, /pnpm exec electron-builder/);
  assert.deepEqual(parseInstallerArguments(["--win", "nsis", "--config.directories.output=C:/fixture output", "--publish", "never"]),
    { output: "C:/fixture output", publish: "never" });
  for (const argument of ["--config=unknown.json", "--mac", "--config.nsis.script=unsafe.nsi"]) assert.throws(() => parseInstallerArguments([argument]));
});
test("production runner keeps both signed script passes, helper compilation and payload validation before build", async () => {
  const events = [];
  class Target { async computeFinalScript(script, installer) { events.push(installer); return "; license, associations and generated macros\n" + script; } }
  const original = Target.prototype.computeFinalScript;
  const builderRoot = dirname(require.resolve("app-builder-lib/package.json"));
  const main = await readFile(join(builderRoot, "templates/nsis/installer.nsi"), "utf8");
  await runElectronInstaller(["--win", "nsis", "--config.directories.output=C:/fixture output", "--publish", "never"], {
    Target, builderRoot, root, compileHelper: async (path) => { assert.equal(path, root); events.push("compile-owned-helper"); }, afterPack: async () => { events.push("patch-icon"); },
    api: { Arch: { x64: 1 }, Platform: { WINDOWS: { createTarget: (...args) => args } }, async build(options) {
      assert.equal(events[0], "compile-owned-helper"); assert.equal(options.projectDir, root); assert.equal(options.publish, "never"); assert.equal(options.config.directories.output, "C:/fixture output");
      for (const pass of [false, true]) {
        const output = await new Target().computeFinalScript(main, pass, new Map());
        assert.match(output, /^!define QA_VERIFIED_OVERLAY_BUILD "25.1.8-v1"\n; license, associations and generated macros/);
        for (const name of ["installSection.nsh", "multiUser.nsh", "assistedInstaller.nsh", "uninstaller.nsh", "installUtil.nsh"]) {
          const path = output.split("\n").find((line) => line.trim().startsWith("!include ") && line.endsWith(`${name}"`))?.match(/!include "([^"]+)"/)?.[1];
          assert.ok(path); const source = await readFile(path, "utf8");
          if (name === "installSection.nsh") assert.doesNotMatch(source, /!insertmacro uninstallOldVersion/);
          if (name === "installUtil.nsh") assert.doesNotMatch(source, /Function |ExecWait|uninstallOldVersion/);
          if (name === "multiUser.nsh") {
            assert.match(source, /StrCpy \$INSTDIR "\$LOCALAPPDATA\\QuickerAgent"/);
            assert.match(source, /GetParameter\} \$R0 "D" ""[^]*?StrCpy \$INSTDIR \$R0/);
          }
          if (name === "assistedInstaller.nsh") assert.doesNotMatch(source.match(/Function instFilesPre[^]*?FunctionEnd/)?.[0] ?? "", /StrCpy \$INSTDIR/);
          if (name === "uninstaller.nsh") assert.ok(source.indexOf("!insertmacro initMultiUser") < source.indexOf("call un.checkAppRunning"), "silent uninstall resolves its registered/final directory before the ownership gate");
        }
      }
      const parent = resolve(root, "../.tmp"); await mkdir(parent, { recursive: true }); const output = await mkdtemp(join(parent, "nsis-payload-fixture-"));
      await mkdir(join(output, "resources")); await writeFile(join(output, "quicker-agent.exe"), "fake payload"); await writeFile(join(output, "resources/app.asar"), "fake archive");
      await options.config.afterPack({ appOutDir: output });
      const wrongType = await mkdtemp(join(parent, "nsis-type-fixture-")); await mkdir(join(wrongType, "cache.dll"));
      await assert.rejects(options.config.afterPack({ appOutDir: wrongType }), /unowned\/user-data/, "a DLL-like directory must be rejected before traversal, even if empty");
      await mkdir(join(output, "local")); await writeFile(join(output, "local/user-data.sqlite"), "untouched fixture user data");
      await assert.rejects(options.config.afterPack({ appOutDir: output }), /unowned\/user-data/);
      assert.equal(await readFile(join(output, "local/user-data.sqlite"), "utf8"), "untouched fixture user data");
      return "fake-build-only";
    } },
  });
  assert.deepEqual(events, ["compile-owned-helper", false, true, "patch-icon"]); assert.equal(Target.prototype.computeFinalScript, original);
});
test("resource payload cannot overwrite colocated user profiles or use ambiguous paths", () => {
  verifyInstallerPayloadPaths(["quicker-agent.exe", "resources/app.asar", "resources/OneDrive.svg", "locales/en-US.pak", "vulkan-1.dll", "LICENSES.chromium.html"]);
  for (const paths of [["local/chat.sqlite"], ["plugins/package.dll"], ["cache/temp"], [".local/history"], ["llm-config.json"], ["resources/../local/chat.sqlite"], ["resources/a", "Resources/A"], ["resources/OneDrive-fixture/not-read.exe"]])
    assert.throws(() => verifyInstallerPayloadPaths(paths));
});
