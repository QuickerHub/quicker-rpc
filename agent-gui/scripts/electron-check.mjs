/**
 * Syntax-check all Electron main-process modules (no Next build required).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronRoot = join(agentGuiRoot, "electron");
const allowedModuleRoots = [electronRoot, join(agentGuiRoot, "browser-runtime")];

function collectMjsFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "resources"
        || entry.name === "dist"
        || entry.name === "build"
        || entry.name === "shell-app"
      ) {
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

const electronApiPath = join(electronRoot, "electron-api.mjs");
const electronApiExports = new Set(
  [...readFileSync(electronApiPath, "utf8").matchAll(/export\s+const\s+(\w+)/g)]
    .map((match) => match[1]),
);

function checkModuleContracts(file) {
  const src = readFileSync(file, "utf8");
  const rel = relative(agentGuiRoot, file).replaceAll("\\", "/");

  const importPatterns = [
    /\b(?:import|export)\s+(?:[^;]*?\s+from\s+)?["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
  ];
  for (const pattern of importPatterns) {
    for (const match of src.matchAll(pattern)) {
      // ESM query/fragment suffixes select module instances, not different files.
      const target = fileURLToPath(new URL(match[1], pathToFileURL(file)));
      const isStagedSource = allowedModuleRoots.some(
        (root) => target === root || target.startsWith(`${root}${sep}`),
      );
      if (!isStagedSource) {
        console.error(`FAIL ${rel}: relative import escapes staged source roots: ${match[1]}`);
        failed += 1;
      } else if (!existsSync(target)) {
        console.error(`FAIL ${rel}: missing relative import: ${match[1]}`);
        failed += 1;
      }
    }
  }

  const apiImportPattern = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*electron-api\.mjs["']/g;
  for (const match of src.matchAll(apiImportPattern)) {
    const names = match[1]
      .split(",")
      .map((name) => name.trim().split(/\s+as\s+/)[0])
      .filter(Boolean);
    for (const name of names) {
      if (!electronApiExports.has(name)) {
        console.error(`FAIL ${rel}: electron-api.mjs does not export ${name}`);
        failed += 1;
      }
    }
  }
}

for (const file of files) {
  const rel = relative(agentGuiRoot, file).replaceAll("\\", "/");
  checkModuleContracts(file);
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
