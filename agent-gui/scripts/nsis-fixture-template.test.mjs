import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { createIsolatedCustomInclude, installIsolatedNsisFixtureAdapter } from "./nsis-fixture-template.mjs";

const require = createRequire(import.meta.url), builder = dirname(require.resolve("app-builder-lib/package.json"));
const template = (name) => readFileSync(join(builder, "templates/nsis", name), "utf8");
const input = {
  builderVersion: JSON.parse(readFileSync(join(builder, "package.json"), "utf8")).version,
  mainTemplate: template("installer.nsi"), installSection: template("installSection.nsh"),
  assistedInstaller: template("assistedInstaller.nsh"), multiUser: template("multiUser.nsh"), uninstaller: template("uninstaller.nsh"),
  generatedSectionPath: "D:/repo/.tmp/nsis-fixture/section.nsh", generatedAssistedPath: "D:/repo/.tmp/nsis-fixture/assisted.nsh",
  generatedMultiUserPath: "D:/repo/.tmp/nsis-fixture/multiUser.nsh", generatedUninstallerPath: "D:/repo/.tmp/nsis-fixture/uninstaller.nsh",
};
const fixture = {
  directory: "D:/repo/.tmp/nsis-fixture/install", cacheDirectory: "D:/repo/.tmp/nsis-fixture/cache",
  stubDirectory: "D:/repo/.tmp/nsis-fixture/stub", generatedPayloadIncludePath: "D:/repo/.tmp/nsis-fixture/payload.nsh",
  customIncludeSource: readFileSync(new URL("../electron/build/installer.nsh", import.meta.url), "utf8"),
  payloadIncludeSource: template("include/installer.nsh"),
};
const normal = (value) => value.replaceAll("\r\n", "\n");

test("fixture custom include disables all shortcut code and rejects another final directory before the helper", () => {
  const source = createIsolatedCustomInclude(fixture.customIncludeSource, fixture.directory);
  for (const name of ["customInit", "customInstall", "customUnInstall", "customPageAfterChangeDir"])
    assert.ok(source.includes(`!macro ${name}\n!macroend`), name);
  assert.match(source, /!macro customWelcomePage\s+!insertmacro MUI_PAGE_WELCOME\s+!macroend/);
  assert.doesNotMatch(source, /CreateShortCut|\$DESKTOP|\$SMPROGRAMS|SHChangeNotify|Function QuickerAgentShortcuts|Var QA_/);
  const gate = source.indexOf('${If} $INSTDIR != "D:\\repo\\.tmp\\nsis-fixture\\install"');
  assert.ok(gate > source.indexOf("!macro QA_RunOwnership MODE"));
  assert.ok(gate < source.indexOf("  InitPluginsDir"));
  assert.match(source.slice(gate, source.indexOf("  InitPluginsDir")), /SetErrorLevel 2\s+Abort/);
  assert.match(source, /--mode "\$\{MODE\}" --directory "\$INSTDIR"/);
  assert.equal(normal(fixture.customIncludeSource), normal(readFileSync(new URL("../electron/build/installer.nsh", import.meta.url), "utf8")));
});

test("fixture adapter confines generated layout, payload cache, uninstall cleanup and all automatic launch calls", async () => {
  class Target { async computeFinalScript(source) { return source; } }
  const original = Target.prototype.computeFinalScript;
  const adapter = installIsolatedNsisFixtureAdapter(Target, input, fixture);
  try {
    assert.ok(adapter.generatedSection.startsWith('!include "D:\\repo\\.tmp\\nsis-fixture\\payload.nsh"\n'));
    assert.doesNotMatch(adapter.generatedSection, /!insertmacro (?:doStartApp|uninstallOldVersion|handleUninstallResult)/);
    assert.match(adapter.generatedSection, /!macro doStartApp/);
    assert.match(adapter.generatedSection, /QA_VerifyOverlayInstall SHELL_CONTEXT/);
    assert.match(adapter.generatedSection, /!insertmacro installApplicationFiles\s+!insertmacro registryAddInstallInfo/);
    assert.ok(adapter.generatedLayout.multiUser.includes('StrCpy $INSTDIR "D:\\repo\\.tmp\\nsis-fixture\\install"'));
    assert.doesNotMatch(adapter.generatedLayout.multiUser, /\$LOCALAPPDATA\\QuickerAgent/);
    const uninstall = adapter.generatedLayout.uninstaller;
    assert.ok(uninstall.includes('Function un.onInit\n  StrCpy $INSTDIR "D:\\repo\\.tmp\\nsis-fixture\\install"\n  SetOutPath $INSTDIR'));
    assert.doesNotMatch(uninstall, /UninstAppUserModelId|UninstShortcut|SHChangeNotify|delete-app-data|isDeleteAppData|\$APPDATA|\$SMPROGRAMS|\$DESKTOP/);
    assert.match(uninstall, /DeleteRegKey SHELL_CONTEXT "\$\{UNINSTALL_REGISTRY_KEY\}"/);
    assert.match(uninstall, /DeleteRegKey SHELL_CONTEXT "\$\{INSTALL_REGISTRY_KEY\}"/);
    assert.doesNotMatch(adapter.generatedPayloadInclude, /\$LOCALAPPDATA/);
    assert.ok(adapter.generatedPayloadInclude.includes('"D:\\repo\\.tmp\\nsis-fixture\\cache\\${APP_INSTALLER_STORE_FILE}"'));
    assert.ok(adapter.generatedPayloadInclude.includes('"D:\\repo\\.tmp\\nsis-fixture\\cache\\${APP_PACKAGE_STORE_FILE}"'));
    assert.match(adapter.generatedPayloadInclude, /extractEmbeddedAppPackage/);
    assert.equal(adapter.generatedCustomInclude, createIsolatedCustomInclude(fixture.customIncludeSource, fixture.directory));
    const output = await new Target().computeFinalScript(input.mainTemplate, true, ["x64"]);
    assert.ok(output.includes('!ifdef BUILD_UNINSTALLER\n    StrCpy $INSTDIR "D:\\repo\\.tmp\\nsis-fixture\\stub"\n  !else\n    StrCpy $INSTDIR "D:\\repo\\.tmp\\nsis-fixture\\install"\n  !endif\n  SetOutPath $INSTDIR'));
    assert.match(output, /QA_VERIFIED_OVERLAY_BUILD "25.1.8-v1"/);
  } finally { adapter.restore(); }
  assert.equal(Target.prototype.computeFinalScript, original);
});

test("fixture adaptation retains both original signed-uninstaller passes and restores the exact original method", async () => {
  const calls = [];
  class Target { async computeFinalScript(source, installer, archs) { calls.push([this, installer, archs]); return "; original generated header\n" + source; } }
  const original = Target.prototype.computeFinalScript, target = new Target();
  const adapter = installIsolatedNsisFixtureAdapter(Target, input, fixture);
  try {
    for (const pass of [false, true]) {
      const output = await target.computeFinalScript(input.mainTemplate, pass, ["x64"]);
      assert.ok(output.includes("; original generated header"));
      assert.ok(output.includes('!include "D:\\repo\\.tmp\\nsis-fixture\\uninstaller.nsh"'));
      assert.equal(output.split("Function .onInit\n").length, 2);
    }
    assert.deepEqual(calls.map(([, installer, archs]) => [installer, archs]), [[false, ["x64"]], [true, ["x64"]]]);
    assert.ok(calls.every(([owner]) => owner === target));
  } finally { adapter.restore(); }
  assert.equal(Target.prototype.computeFinalScript, original);
});

test("all fixture constants and generated include paths require literal local repository temporary paths", () => {
  class Target { async computeFinalScript(source) { return source; } }
  for (const bad of ["relative/path", "C:/", "//server/share/.tmp/fixture", "D:/repo/install", "D:/repo/.tmp/../outside", "D:/repo/.tmp/name.", "D:/repo/.tmp/evil:$x", 'D:/repo/.tmp/quote"', "D:/repo/.tmp/line\nnext", "D:/repo/.tmp/$INSTDIR", "D:/repo/.tmp/wild*", "D:/repo/.tmp//double", "D:/repo/.tmp/space "])
    for (const field of ["directory", "cacheDirectory", "stubDirectory", "generatedPayloadIncludePath"])
      assert.throws(() => installIsolatedNsisFixtureAdapter(Target, input, { ...fixture, [field]: bad }), undefined, `${field}: ${bad}`);
  for (const field of ["generatedSectionPath", "generatedAssistedPath", "generatedMultiUserPath", "generatedUninstallerPath"])
    assert.throws(() => installIsolatedNsisFixtureAdapter(Target, { ...input, [field]: "D:/outside/include.nsh" }, fixture));
});

test("source drift and absent layout reject before patching the target prototype", () => {
  class Target { async computeFinalScript(source) { return source; } }
  const original = Target.prototype.computeFinalScript;
  for (const changed of [
    { customIncludeSource: fixture.customIncludeSource + "\n; changed" },
    { customIncludeSource: fixture.customIncludeSource + "\n!macro customInstall\n!macroend" },
    { payloadIncludeSource: fixture.payloadIncludeSource.replace("$LOCALAPPDATA", "$APPDATA") },
  ]) {
    assert.throws(() => installIsolatedNsisFixtureAdapter(Target, input, { ...fixture, ...changed }));
    assert.equal(Target.prototype.computeFinalScript, original);
  }
  assert.throws(() => installIsolatedNsisFixtureAdapter(Target, { ...input, assistedInstaller: undefined }, fixture));
  assert.equal(Target.prototype.computeFinalScript, original);
  assert.throws(() => createIsolatedCustomInclude(fixture.customIncludeSource + "\n", fixture.directory));
});

test("missing or duplicate final-script anchors reject and restoration never overwrites a foreign hook", async () => {
  let suffix = "", removeMainAnchor = false;
  class Target { async computeFinalScript(source) { return (removeMainAnchor ? source.replace("Function .onInit", "Function changedInit") : source) + suffix; } }
  const original = Target.prototype.computeFinalScript;
  const adapter = installIsolatedNsisFixtureAdapter(Target, input, fixture), wrapped = Target.prototype.computeFinalScript;
  try {
    suffix = "\nFunction .onInit\n  Call setInstallSectionSpaceRequired\n\n  SetOutPath $INSTDIR";
    await assert.rejects(new Target().computeFinalScript(input.mainTemplate, true, []), /exactly once/);
    suffix = "";
    removeMainAnchor = true;
    await assert.rejects(new Target().computeFinalScript(input.mainTemplate, true, []), /exactly once/);
    removeMainAnchor = false;
    await assert.rejects(new Target().computeFinalScript(input.mainTemplate + "\n; drift", true, []));
    const foreign = () => {};
    Target.prototype.computeFinalScript = foreign;
    assert.throws(() => adapter.restore(), /ownership changed/);
    assert.equal(Target.prototype.computeFinalScript, foreign);
  } finally { Target.prototype.computeFinalScript = wrapped; adapter.restore(); }
  assert.equal(Target.prototype.computeFinalScript, original);
});
