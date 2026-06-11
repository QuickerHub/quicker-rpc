/**
 * Copy NSIS installer icon into electron/build (one-click UI uses ICO only).
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(agentGuiRoot, "electron", "build");

export async function generateElectronInstallerAssets() {
  mkdirSync(buildDir, { recursive: true });

  const icoSrc = join(agentGuiRoot, "src-tauri", "icons", "icon.ico");
  const icoDest = join(buildDir, "installerIcon.ico");
  copyFileSync(icoSrc, icoDest);

  console.log(`generate-electron-installer-assets: ${icoDest}`);
}

if (process.argv[1]?.includes("generate-electron-installer-assets.mjs")) {
  generateElectronInstallerAssets().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
