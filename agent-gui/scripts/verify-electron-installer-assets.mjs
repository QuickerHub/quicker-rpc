/**
 * Verify Electron NSIS assets (assisted installer: icon + installer.nsh hooks).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateElectronInstallerAssets } from "./generate-electron-installer-assets.mjs";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(agentGuiRoot, "electron", "build");

const required = [
  { name: "installerIcon.ico", minBytes: 1_000 },
  { name: "installer.nsh", minBytes: 100 },
];

const missing = required.filter(({ name }) => !existsSync(join(buildDir, name)));
if (missing.length > 0) {
  console.log("verify-electron-installer-assets: generating missing assets...");
  await generateElectronInstallerAssets();
}

for (const { name, minBytes } of required) {
  const path = join(buildDir, name);
  if (!existsSync(path)) {
    console.error(`verify-electron-installer-assets: missing ${path}`);
    process.exit(1);
  }
  if (statSync(path).size < minBytes) {
    console.error(`verify-electron-installer-assets: ${name} too small`);
    process.exit(1);
  }
}

const nsh = readFileSync(join(buildDir, "installer.nsh"), "utf8");
if (!nsh.includes("ManifestDPIAware true")) {
  console.error("verify-electron-installer-assets: installer.nsh missing DPI manifest");
  process.exit(1);
}
if (!nsh.includes("customPageAfterChangeDir")) {
  console.error("verify-electron-installer-assets: installer.nsh missing shortcut options page");
  process.exit(1);
}
if (!nsh.includes("ApplyQuickerAgentShortcutChoices")) {
  console.error("verify-electron-installer-assets: installer.nsh missing shortcut apply macro");
  process.exit(1);
}
if (/!insertmacro\s+MUI_HEADER_TEXT/i.test(nsh)) {
  console.error(
    "verify-electron-installer-assets: MUI_HEADER_TEXT macro is unavailable in electron-builder NSIS",
  );
  process.exit(1);
}
if (!nsh.includes('$LOCALAPPDATA\\QuickerAgent')) {
  console.error(
    "verify-electron-installer-assets: installer must default INSTDIR to %LOCALAPPDATA%\\QuickerAgent",
  );
  process.exit(1);
}
if (nsh.includes("RMDir /r") && nsh.includes("ai.quicker.agent")) {
  console.error(
    "verify-electron-installer-assets: installer must not delete ai.quicker.agent (legacy chat profile)",
  );
  process.exit(1);
}
if (!nsh.includes("customRemoveFiles")) {
  console.error(
    "verify-electron-installer-assets: installer.nsh missing customRemoveFiles (preserve user data on update)",
  );
  process.exit(1);
}

console.log("verify-electron-installer-assets: PASS");
