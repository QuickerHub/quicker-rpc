import { existsSync } from "node:fs";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import {
  readQuickerRpcSemverFromJson,
  readQuickerRpcVersionJson as readQuickerRpcVersionJsonFile,
  readQuickerRpcVersionString,
  resolveQuickerRpcVersionJsonPath as resolveQuickerRpcVersionJsonPathImpl,
  resolveQuickerRpcVersionStringFromJson,
} from "../../scripts/lib/quicker-rpc-version.mjs";

export {
  readQuickerRpcSemverFromJson,
  readQuickerRpcVersionString,
  resolveQuickerRpcVersionStringFromJson,
};

/**
 * Resolve QuickerRpc product version.json after layout migration.
 * @param {string} repoRoot quicker-rpc monorepo root (parent of agent-gui)
 * @returns {string | null}
 */
export function resolveQuickerRpcVersionJsonPath(repoRoot) {
  return resolveQuickerRpcVersionJsonPathImpl(repoRoot);
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
  return readQuickerRpcVersionJsonFile(repoRoot);
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
