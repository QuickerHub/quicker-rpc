import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// Read production input and the exact installed builder templates; no native process,
// installer, registry or user profile is touched by these contract regressions.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const builder = dirname(require.resolve("app-builder-lib/package.json"));
const readTemplate = (name) => readFileSync(join(builder, "templates/nsis", name), "utf8");
const source = readFileSync(join(root, "electron/build/installer.nsh"), "utf8");
const macro = (name) => source.match(new RegExp(`!macro\\s+${name}\\b([^]*?)!macroend`, "i"))?.[1];

test("installer customizations never kill applications by shared image name", () => {
  assert.doesNotMatch(source, /taskkill[^\r\n]*\/IM\b|nsProcess::(?:KillProcess|CloseProcess)/i,
    "an image name is not proof that a process belongs to the final installation target");
  assert.doesNotMatch(macro("customInit") ?? "", /StopQuickerAgentInstallTree|_KillImage/i,
    "onInit runs before the user's final directory choice");
});

test("the final-directory CHECK_APP_RUNNING hook overrides builder's image-wide fallback", () => {
  assert.ok(macro("customCheckAppRunning"), "the default builder fallback also kills by basename and must be replaced");
  const check = readTemplate("include/allowOnlyOneInstallerInstance.nsh");
  assert.match(check, /!macro CHECK_APP_RUNNING[^]*?!ifmacrodef customCheckAppRunning[^]*?!insertmacro customCheckAppRunning/);
  assert.match(check, /!macro _CHECK_APP_RUNNING[^]*?taskkill \/im/i,
    "removing only the customInit kill would leave a second global-kill path active");
  assert.match(macro("QA_RunOwnership") ?? "", /!ifndef QA_VERIFIED_OVERLAY_BUILD[^]*?!error/,
    "raw builder invocations cannot bypass the safe overlay generation path");
});

test("the supported hook sees final INSTDIR before legacy uninstall or file extraction", () => {
  const install = readTemplate("installSection.nsh"), pages = readTemplate("assistedInstaller.nsh");
  assert.ok(install.indexOf('StrCpy $appExe "$INSTDIR\\${APP_EXECUTABLE_FILENAME}"') < install.indexOf("!insertmacro CHECK_APP_RUNNING"));
  assert.ok(install.indexOf("!insertmacro CHECK_APP_RUNNING") < install.indexOf("!insertmacro uninstallOldVersion"));
  assert.ok(install.indexOf("!insertmacro uninstallOldVersion") < install.indexOf("!insertmacro installApplicationFiles"));
  assert.match(pages, /Function instFilesPre[^]*?StrCpy \$INSTDIR[^]*?FunctionEnd/,
    "the final instfiles pre-callback can still change the directory after the custom shortcut page");
  assert.match(readTemplate("uninstaller.nsh"), /Function un\.checkAppRunning\s+!insertmacro CHECK_APP_RUNNING/);
});

test("legacy upgrade invokes the old uninstaller and cannot inherit a new include's safety", () => {
  const old = readTemplate("include/installUtil.nsh"), uninstall = readTemplate("uninstaller.nsh");
  assert.match(old, /copyFile "\$uninstallerFileName" "\$uninstallerFileNameTemp"/);
  assert.match(old, /ExecWait[^\r\n]*\$uninstallerFileNameTemp[^\r\n]*\/S[^\r\n]*_\?=\$installationDir/);
  assert.ok(uninstall.indexOf("!insertmacro customRemoveFiles") < uninstall.indexOf("!insertmacro customUnInstall"),
    "customUnInstall is after removal; it cannot be the pre-mutation ownership gate");
  assert.match(source, /!macro customRemoveFiles[^]*?\$\{isUpdated\}[^]*?quitSuccess/,
    "in-place upgrade preservation must remain explicit; this does not repair an older embedded uninstaller");
});
