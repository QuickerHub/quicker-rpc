/**
 * Stage Next standalone + qkrpc + portable Node for Electron bundle (electron/resources/).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareDesktopBundle,
  readDesktopBundleSemver,
} from "./desktop-bundle-prepare.mjs";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(agentGuiRoot, "..");
const tauriRoot = join(agentGuiRoot, "src-tauri");
const resourcesDir = join(agentGuiRoot, "electron", "resources");
const voiceMetadataSrc = join(tauriRoot, "voice-plugin-metadata");

function syncPackageVersion() {
  const version = readDesktopBundleSemver(repoRoot);
  const pkgPath = join(agentGuiRoot, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (pkg.version !== version) {
    pkg.version = version;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
    console.log(`package.json version -> ${version}`);
  } else {
    console.log(`package.json version already ${version}`);
  }
}

function main() {
  console.log("electron-prepare: staging runtime for Electron bundle...");
  prepareDesktopBundle({
    resourcesDir,
    voiceMetadataSrc,
    agentGuiRoot,
    repoRoot,
    label: "electron-staged",
  });
  syncPackageVersion();
  console.log("electron-prepare: done.");
}

main();
