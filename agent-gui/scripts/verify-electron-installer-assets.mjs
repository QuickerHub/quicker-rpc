/**
 * Verify Electron NSIS assets (one-click: icon + installer.nsh only).
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

console.log("verify-electron-installer-assets: PASS");
