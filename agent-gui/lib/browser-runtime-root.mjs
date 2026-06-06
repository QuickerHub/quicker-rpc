import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locate agent-gui root that contains browser-runtime/server.mjs.
 * Works in dev (agent-gui/) and bundled Tauri (resources/app/).
 * @param {string} [startDir]
 */
export function resolveBrowserRuntimeRoot(startDir = process.cwd()) {
  /** @type {string[]} */
  const candidates = [
    startDir,
    join(startDir, ".."),
    join(startDir, "agent-gui"),
    join(dirname(fileURLToPath(import.meta.url)), ".."),
  ];

  const seen = new Set();
  for (const dir of candidates) {
    const normalized = resolve(dir);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    if (existsSync(join(normalized, "browser-runtime", "server.mjs"))) {
      return normalized;
    }
  }
  return startDir;
}
