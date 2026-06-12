/**
 * Regenerate src-tauri/icons/* from app/icon.svg (QuickerAgent brand mark).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function generateAppIcons() {
  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "tauri", "icon", "app/icon.svg", "-o", "src-tauri/icons"],
    {
      cwd: agentGuiRoot,
      stdio: "inherit",
      env: process.env,
    },
  );
  if (result.status !== 0) {
    throw new Error(`tauri icon failed (exit ${result.status ?? "unknown"})`);
  }
  console.log("generate-app-icons: src-tauri/icons updated from app/icon.svg");
}

if (process.argv[1]?.includes("generate-app-icons.mjs")) {
  generateAppIcons();
}
