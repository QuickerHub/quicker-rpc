import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readdirSync } from "node:fs";

/**
 * Resolve QuickerRpc product version.json after layout migration.
 * @param {string} repoRoot quicker-rpc monorepo root (parent of agent-gui)
 * @returns {string | null}
 */
export function resolveQuickerRpcVersionJsonPath(repoRoot) {
  const product = join(repoRoot, "QuickerRpc", "version.json");
  if (existsSync(product)) return product;
  const legacy = join(repoRoot, "version.json");
  if (existsSync(legacy)) return legacy;
  return null;
}

/** @param {string} dir */
export function isQuickerRpcMonorepoRoot(dir) {
  if (!resolveQuickerRpcVersionJsonPath(dir)) return false;
  // Bundled desktop app copies version.json next to server.js — not the monorepo root.
  if (existsSync(join(dir, "server.js"))) return false;
  return existsSync(join(dir, "agent-gui")) || existsSync(join(dir, "publish"));
}

/** @param {string} repoRoot */
export function readQuickerRpcVersionJson(repoRoot) {
  const path = resolveQuickerRpcVersionJsonPath(repoRoot);
  if (!path) {
    throw new Error(
      `version.json not found under ${repoRoot} (expected QuickerRpc/version.json)`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

/** dotnet publish / local dev Console Release output folders (new + legacy layout). */
export function listConsoleReleaseOutputDirs(agentGuiRoot) {
  /** @type {string[]} */
  const releaseRoots = [
    join(agentGuiRoot, "..", "QuickerRpc", "src", "QuickerRpc.Console", "bin", "Release"),
    join(agentGuiRoot, "..", "QuickerRpc.Console", "bin", "Release"),
  ];
  /** @type {string[]} */
  const dirs = [];
  for (const releaseRoot of releaseRoots) {
    if (!existsSync(releaseRoot)) continue;
    for (const tfm of readdirSync(releaseRoot, { withFileTypes: true })) {
      if (!tfm.isDirectory() || !tfm.name.startsWith("net")) continue;
      const base = join(releaseRoot, tfm.name);
      dirs.push(join(base, "win-x64"), base);
    }
  }
  return dirs;
}
