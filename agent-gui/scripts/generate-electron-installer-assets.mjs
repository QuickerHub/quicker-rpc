/**
 * Sync installer ICO from src-tauri/icons (generated from app/icon.svg).
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateAppIcons } from "./generate-app-icons.mjs";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = join(agentGuiRoot, "electron", "build");

export async function generateElectronInstallerAssets({ regenFromSvg = false } = {}) {
  if (regenFromSvg) {
    generateAppIcons();
  }
  mkdirSync(buildDir, { recursive: true });

  const icoSrc = join(agentGuiRoot, "src-tauri", "icons", "icon.ico");
  const icoDest = join(buildDir, "installerIcon.ico");
  copyFileSync(icoSrc, icoDest);

  console.log(`generate-electron-installer-assets: ${icoDest}`);
}

if (process.argv[1]?.includes("generate-electron-installer-assets.mjs")) {
  const regenFromSvg = process.argv.includes("--regen");
  generateElectronInstallerAssets({ regenFromSvg }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
