/**
 * Resolve Electron binary without installing the npm `electron` package
 * (that package shadows the built-in `electron` module in the main process).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @returns {string | null} */
export function resolveElectronBinary() {
  const pkgNames = ["electron-binary", "electron"];
  for (const pkgName of pkgNames) {
    const pkgRoot = join(agentGuiRoot, "node_modules", pkgName);
    const pathFile = join(pkgRoot, "path.txt");
    if (!existsSync(pathFile)) continue;
    const rel = readFileSync(pathFile, "utf8").trim();
    const exe = join(pkgRoot, "dist", rel);
    if (existsSync(exe)) return exe;
  }
  return null;
}

/** @returns {string | null} */
export function resolveElectronCli() {
  const pkgNames = ["electron-binary", "electron"];
  for (const pkgName of pkgNames) {
    const cli = join(agentGuiRoot, "node_modules", pkgName, "cli.js");
    if (existsSync(cli)) return cli;
  }
  return null;
}
