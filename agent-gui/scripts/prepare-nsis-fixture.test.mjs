import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parseFixtureArguments, fixtureBuilderConfig, assertFixturePreprocessed, NSIS_FIXTURE_IDENTITY } from "./prepare-nsis-fixture.mjs";
import { stageElectronShell } from "./electron-shell-staging.mjs";

test("fixture entry accepts only preparation/audit/build/inspection and two explicit versions", () => {
  assert.deepEqual(parseFixtureArguments(["audit", "--version=0.0.1"]), { action: "audit", version: "0.0.1" });
  for (const args of [["install"], ["launch"], ["uninstall"], ["prepare"], ["build", "--version=0.14.8"], ["build", "--version=0.0.1", "--config=unsafe"], ["audit", "--version=0.0.1", "--version=0.0.2"]]) assert.throws(() => parseFixtureArguments(args));
});
test("fixture builder identity/resources are explicit and production configuration is unchanged", () => {
  const root = resolve(import.meta.dirname, ".."), pkgPath = join(root, "package.json"), before = readFileSync(pkgPath, "utf8");
  const manifest = { ...NSIS_FIXTURE_IDENTITY, sources: { electron: "C:/fixture/electron" }, resources: "C:/fixture/resources", buildResources: "C:/fixture/build" };
  const one = fixtureBuilderConfig(manifest, "0.0.1"), two = fixtureBuilderConfig(manifest, "0.0.2");
  for (const config of [one, two]) {
    assert.equal(config.appId, NSIS_FIXTURE_IDENTITY.appId); assert.equal(config.nsis.guid, NSIS_FIXTURE_IDENTITY.guid);
    assert.equal(config.productName, NSIS_FIXTURE_IDENTITY.productName); assert.equal(config.nsis.uninstallDisplayName, config.productName);
    assert.equal(config.nsis.createDesktopShortcut, false); assert.equal(config.nsis.createStartMenuShortcut, false); assert.equal(config.nsis.runAfterFinish, false);
    assert.equal(config.nsis.allowElevation, false); assert.equal(config.nsis.perMachine, false); assert.equal(config.publish, null);
    assert.match(config.directories.output, /[\\/]\.tmp[\\/]nsis-fixture-4ad81d73[\\/]output[\\/]0\.0\.[12]$/);
    assert.equal(config.extraResources[0].from, manifest.resources); assert.equal(config.win.executableName, "quicker-agent");
  }
  assert.equal(readFileSync(pkgPath, "utf8"), before);
});
test("shared shell staging supports fresh owned output and offline dependency staging without npm", () => {
  const parent = resolve(import.meta.dirname, "../../.tmp"); mkdirSync(parent, { recursive: true });
  const run = mkdtempSync(join(parent, "nsis-shell-test-")), output = join(run, "shell"); let calls = 0;
  stageElectronShell({ version: "0.0.1", packageName: NSIS_FIXTURE_IDENTITY.packageName, outputDirectory: output,
    installDependencies(directory) { assert.equal(directory, output); calls++; writeFileSync(join(directory, "offline-staged"), "fixture"); } });
  assert.equal(calls, 1); const pkg = JSON.parse(readFileSync(join(output, "package.json"), "utf8"));
  assert.equal(pkg.name, NSIS_FIXTURE_IDENTITY.packageName); assert.equal(pkg.version, "0.0.1");
  assert.equal(existsSync(join(output, "electron/bootstrap.cjs")), true); assert.equal(existsSync(join(output, "electron/smoke-isolation.mjs")), true);
  assert.equal(existsSync(join(output, "browser-runtime/protocol.mjs")), true); assert.equal(existsSync(join(output, "lib/agent-data-profile.mjs")), true);
  assert.throws(() => stageElectronShell({ outputDirectory: output }), /new repository/);
  assert.throws(() => stageElectronShell({ outputDirectory: resolve(parent, "../not-tmp") }), /new repository/);
});
test("real-builder preprocessing gate refuses foreign registry/shell actions and unconfined stub startup", () => {
  const manifest = { directory: "D:\\repo\\.tmp\\fixture\\installed", stubDirectory: "D:\\repo\\.tmp\\fixture\\stub", registryKeys: ["Software\\fixture-guid"] };
  const output = "D:\\repo\\.tmp\\fixture\\uninstaller.exe";
  const source = `Function .onInit\nCall setInstallSectionSpaceRequired\nStrCpy $INSTDIR "${manifest.stubDirectory}"\nSetOutPath $INSTDIR\nWriteUninstaller "${output}"\nSetErrorLevel 0\nQuit\nFunctionEnd\nWriteRegStr SHCTX "Software\\fixture-guid" Name "fixture"`;
  assert.match(assertFixturePreprocessed(source, manifest, { stub: true, uninstallerOutput: output }), /WriteUninstaller/);
  for (const changed of [source.replace("Software\\fixture-guid", "Software\\foreign"), source.replace("Call setInstallSectionSpaceRequired", "Call foreignStartup"), source.replace(manifest.stubDirectory, "C:\\Users\\somebody"), source.replace("WriteUninstaller", "CreateShortCut"), source + '\nWinShell::UninstAppUserModelId "foreign"', source.replace(output, "C:\\outside.exe")])
    assert.throws(() => assertFixturePreprocessed(changed, manifest, { stub: true, uninstallerOutput: output }));
});
