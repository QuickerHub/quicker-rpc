/**
 * Verify Tauri staged/bundled resources. Delegates to verify-desktop-bundle.mjs.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const resourcesDir = join(agentGuiRoot, "src-tauri", "resources");

const checkBundled = process.env.VERIFY_BUNDLED === "1";
const args = [
  join(agentGuiRoot, "scripts", "verify-desktop-bundle.mjs"),
  "--resources-dir",
  resourcesDir,
  "--label",
  "tauri-staged",
];
if (checkBundled) args.push("--check-bundled");

const { status } = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(status ?? 1);
