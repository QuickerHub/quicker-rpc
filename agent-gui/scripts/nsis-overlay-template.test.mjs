import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { createPinnedNsisOverlay, createPinnedNsisLayout, installPinnedNsisOverlayAdapter } from "./nsis-overlay-template.mjs";

const require = createRequire(import.meta.url), directory = dirname(require.resolve("app-builder-lib/package.json"));
const input = { builderVersion: JSON.parse(readFileSync(join(directory, "package.json"), "utf8")).version,
  mainTemplate: readFileSync(join(directory, "templates/nsis/installer.nsi"), "utf8"),
  installSection: readFileSync(join(directory, "templates/nsis/installSection.nsh"), "utf8"),
  generatedSectionPath: "C:/fixture-only/overlay/installSection.nsh" };

test("pinned overlay removes both old execution branches while retaining extraction, registry and shortcuts", () => {
  const result = createPinnedNsisOverlay(input), section = input.installSection.replaceAll("\r\n", "\n");
  assert.doesNotMatch(result.generatedSection, /!insertmacro (?:uninstallOldVersion|handleUninstallResult)/);
  assert.match(result.generatedSection, /QA_VerifyOverlayInstall SHELL_CONTEXT/);
  assert.match(result.generatedSection, /QA_VerifyOverlayInstall HKEY_CURRENT_USER/);
  assert.match(result.generatedSection, /!ifmacrondef QA_VerifyOverlayInstall\s+!error/);
  const start = section.indexOf("!insertmacro uninstallOldVersion SHELL_CONTEXT"), end = section.indexOf("SetOutPath $INSTDIR");
  assert.equal(result.generatedSection.slice(0, start), section.slice(0, start));
  assert.equal(result.generatedSection.slice(result.generatedSection.indexOf("SetOutPath $INSTDIR")), section.slice(end));
  for (const operation of ["installApplicationFiles", "registryAddInstallInfo", "addStartMenuLink", "addDesktopLink", "customInstall"])
    assert.match(result.generatedSection, new RegExp(`!insertmacro ${operation}`));
  assert.doesNotMatch(result.generatedSection, /DeleteRegKey|RMDir \/r|!macroundef|taskkill/);
});
test("upstream drift, duplicate anchors, path interpolation and custom scripts fail closed", () => {
  for (const changed of [{ builderVersion: "25.1.9" }, { mainTemplate: input.mainTemplate + "\n; changed" },
    { installSection: input.installSection.replace("HKEY_CURRENT_USER", "HKCU") },
    { generatedSectionPath: 'C:/fixture/$INSTDIR/file.nsh' }, { generatedSectionPath: 'relative/file.nsh' }])
    assert.throws(() => createPinnedNsisOverlay({ ...input, ...changed }));
  const result = createPinnedNsisOverlay(input);
  assert.throws(() => result.replaceFinalScript(input.mainTemplate.replace('!include "installSection.nsh"', "")));
  assert.throws(() => result.replaceFinalScript(input.mainTemplate + '\n    !include "installSection.nsh"'));
});
test("adapter delegates both original final-script passes without bypassing signed-uninstaller generation", async () => {
  const calls = [];
  class Target {
    async computeFinalScript(script, isInstaller, archs) { calls.push([this, isInstaller, archs]); return "; original license and generated macros\n" + script; }
  }
  const original = Target.prototype.computeFinalScript, adapter = installPinnedNsisOverlayAdapter(Target, input), target = new Target();
  for (const isInstaller of [false, true]) {
    const output = await target.computeFinalScript(input.mainTemplate, isInstaller, ["x64"]);
    assert.match(output, /^!define QA_VERIFIED_OVERLAY_BUILD "25.1.8-v1"\n; original license and generated macros/);
    assert.ok(output.includes('!include "C:\\fixture-only\\overlay\\installSection.nsh"'));
    assert.doesNotMatch(output, /!include "installSection.nsh"/);
  }
  assert.deepEqual(calls.map(([, pass, archs]) => [pass, archs]), [[false, ["x64"]], [true, ["x64"]]]);
  assert.ok(calls.every(([owner]) => owner === target));
  await assert.rejects(target.computeFinalScript(input.mainTemplate + "\n; changed", true, []));
  adapter.restore(); assert.equal(Target.prototype.computeFinalScript, original);
});
test("final-directory layout removes the obsolete StrContains function which fails real NSIS /WX", () => {
  const layout = createPinnedNsisLayout({ ...input,
    assistedInstaller: readFileSync(join(directory, "templates/nsis/assistedInstaller.nsh"), "utf8"),
    multiUser: readFileSync(join(directory, "templates/nsis/multiUser.nsh"), "utf8"),
    uninstaller: readFileSync(join(directory, "templates/nsis/uninstaller.nsh"), "utf8"),
  });
  assert.doesNotMatch(layout.files.assisted, /!include StrContains\.nsh/);
  assert.doesNotMatch(layout.files.assisted.match(/Function instFilesPre[^]*?FunctionEnd/)?.[0] ?? "", /StrCpy|StrContains/);
});
