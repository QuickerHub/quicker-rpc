/**
 * Stage Next standalone + qkrpc + portable Node for Tauri bundle (resources/).
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareDesktopBundle,
  readDesktopBundleSemver,
} from "./desktop-bundle-prepare.mjs";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(agentGuiRoot, "..");
const tauriRoot = join(agentGuiRoot, "src-tauri");
const resourcesDir = join(tauriRoot, "resources");
const voiceMetadataSrc = join(tauriRoot, "voice-plugin-metadata");

function syncTauriVersion() {
  const version = readDesktopBundleSemver(repoRoot);
  const confPath = join(tauriRoot, "tauri.conf.json");
  const conf = JSON.parse(readFileSync(confPath, "utf8"));
  conf.version = version;
  writeFileSync(confPath, `${JSON.stringify(conf, null, 2)}\n`, "utf8");
  console.log(`tauri.conf.json version -> ${version}`);
}

function clearStaleBundledResources() {
  const bundled = join(tauriRoot, "target", "release", "resources");
  if (existsSync(bundled)) {
    rmSync(bundled, { recursive: true, force: true });
    console.log(`Removed stale bundled resources: ${bundled}`);
  }
}

function main() {
  console.log("tauri-prepare: staging runtime for Tauri bundle...");
  clearStaleBundledResources();
  prepareDesktopBundle({
    resourcesDir,
    voiceMetadataSrc,
    agentGuiRoot,
    repoRoot,
    label: "tauri-staged",
  });
  syncTauriVersion();
  console.log("tauri-prepare: done.");
}

main();
