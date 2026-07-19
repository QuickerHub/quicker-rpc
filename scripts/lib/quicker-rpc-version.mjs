import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Four-part version from version.json (legacy QuickerRpc key or release+build).
 * @param {unknown} json
 * @returns {string}
 */
export function resolveQuickerRpcVersionStringFromJson(json) {
  if (!json || typeof json !== "object") {
    throw new Error("version.json missing 'QuickerRpc' or 'release'+'build'");
  }

  const legacy =
    typeof /** @type {{ QuickerRpc?: unknown }} */ (json).QuickerRpc === "string"
      ? /** @type {{ QuickerRpc: string }} */ (json).QuickerRpc.trim()
      : "";
  if (legacy) {
    return legacy;
  }

  const release =
    typeof /** @type {{ release?: unknown }} */ (json).release === "string"
      ? /** @type {{ release: string }} */ (json).release.trim()
      : "";
  if (!release) {
    throw new Error("version.json missing 'QuickerRpc' or 'release'+'build'");
  }

  const build =
    /** @type {{ build?: unknown }} */ (json).build == null
      ? 0
      : Number(/** @type {{ build: unknown }} */ (json).build);
  return `${release}.${Number.isFinite(build) ? build : 0}`;
}

/**
 * @param {string} repoRoot quicker-rpc monorepo root
 * @returns {string | null}
 */
export function resolveQuickerRpcVersionJsonPath(repoRoot) {
  const product = join(repoRoot, "QuickerRpc", "version.json");
  if (existsSync(product)) return product;
  const legacy = join(repoRoot, "version.json");
  if (existsSync(legacy)) return legacy;
  return null;
}

/**
 * @param {string} repoRoot
 * @returns {unknown}
 */
export function readQuickerRpcVersionJson(repoRoot) {
  const path = resolveQuickerRpcVersionJsonPath(repoRoot);
  if (!path) {
    throw new Error(
      `version.json not found under ${repoRoot} (expected QuickerRpc/version.json)`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * @param {string} repoRoot
 * @returns {string}
 */
export function readQuickerRpcVersionString(repoRoot) {
  return resolveQuickerRpcVersionStringFromJson(readQuickerRpcVersionJson(repoRoot));
}

/**
 * @param {unknown} json
 * @returns {string} X.Y.Z
 */
export function readQuickerRpcSemverFromJson(json) {
  const full = resolveQuickerRpcVersionStringFromJson(json);
  const parts = full.replace(/^v/i, "").split(".");
  if (parts.length < 3) {
    throw new Error(`version must have at least three segments: ${full}`);
  }
  return parts.slice(0, 3).join(".");
}

/**
 * @param {string} repoRoot
 * @returns {string} X.Y.Z
 */
export function readQuickerRpcSemver(repoRoot) {
  return readQuickerRpcSemverFromJson(readQuickerRpcVersionJson(repoRoot));
}
