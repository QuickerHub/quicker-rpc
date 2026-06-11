/**
 * Post-build guard: app.asar must stay a thin Electron shell (not duplicate Next deps).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = join(agentGuiRoot, "electron", "dist", "win-unpacked", "resources");

const MAX_ASAR_BYTES = 40 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 5 * 1024 * 1024;
const FORBIDDEN_UNPACKED = ["@next", "next", "playwright", "monaco-editor", "better-sqlite3", "@img"];

function dirSizeBytes(root) {
  let total = 0;
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, ent.name);
    if (ent.isDirectory()) total += dirSizeBytes(path);
    else total += statSync(path).size;
  }
  return total;
}

function main() {
  const asarPath = join(distRoot, "app.asar");
  const unpackedPath = join(distRoot, "app.asar.unpacked");

  if (!existsSync(asarPath)) {
    throw new Error(`Missing ${asarPath} — run pnpm electron:build first`);
  }

  const asarBytes = statSync(asarPath).size;
  if (asarBytes > MAX_ASAR_BYTES) {
    throw new Error(
      `app.asar too large: ${(asarBytes / 1024 / 1024).toFixed(1)} MB ` +
        `(max ${MAX_ASAR_BYTES / 1024 / 1024} MB). ` +
        "Shell staging may be broken — check build.directories.app.",
    );
  }

  if (existsSync(unpackedPath)) {
    const unpackedBytes = dirSizeBytes(unpackedPath);
    if (unpackedBytes > MAX_UNPACKED_BYTES) {
      throw new Error(
        `app.asar.unpacked too large: ${(unpackedBytes / 1024 / 1024).toFixed(1)} MB ` +
          `(max ${MAX_UNPACKED_BYTES / 1024 / 1024} MB)`,
      );
    }
    const nm = join(unpackedPath, "node_modules");
    if (existsSync(nm)) {
      for (const name of readdirSync(nm)) {
        if (FORBIDDEN_UNPACKED.some((prefix) => name === prefix || name.startsWith(prefix))) {
          throw new Error(`app.asar.unpacked must not contain ${name}`);
        }
      }
    }
  }

  console.log(
    `verify-electron-asar: OK app.asar=${(asarBytes / 1024 / 1024).toFixed(2)} MB`,
  );
}

main();
