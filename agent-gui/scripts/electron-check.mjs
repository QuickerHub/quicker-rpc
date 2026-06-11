/**
 * Syntax-check all Electron main-process modules (no Next build required).
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronRoot = join(agentGuiRoot, "electron");

function collectMjsFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "resources" || entry.name === "dist" || entry.name === "build") {
        continue;
      }
      files.push(...collectMjsFiles(path));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".mjs")) {
      files.push(path);
    }
  }
  return files;
}

const files = collectMjsFiles(electronRoot).sort();
let failed = 0;

for (const file of files) {
  const rel = relative(agentGuiRoot, file).replaceAll("\\", "/");
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status === 0) {
    console.log(`ok  ${rel}`);
  } else {
    failed += 1;
    console.error(`FAIL ${rel}`);
    if (result.stderr) console.error(result.stderr.trim());
  }
}

if (failed > 0) {
  console.error(`\nelectron-check: ${failed} file(s) failed`);
  process.exit(1);
}

console.log(`\nelectron-check: ${files.length} module(s) OK`);
process.exit(0);
