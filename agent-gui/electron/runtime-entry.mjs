import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { normalizeRuntimeMode, readRuntimeMode, RUNTIME_MODE_FILE } from "./runtime-mode.mjs";

/** The default is static; legacy is selected explicitly by its build marker or caller. */
export function resolveRuntimeEntry(appDirectory, options = {}) {
  appDirectory = resolve(appDirectory);
  const recordedMode = readRuntimeMode(appDirectory);
  const mode = options.mode === undefined ? recordedMode : normalizeRuntimeMode(options.mode);
  if (options.mode !== undefined && existsSync(join(appDirectory, RUNTIME_MODE_FILE)) && mode !== recordedMode) {
    throw new Error(`Requested ${mode} but ${join(appDirectory, RUNTIME_MODE_FILE)} selects ${recordedMode}`);
  }
  if (mode === "legacy-next") {
    const path = join(appDirectory, "server.js");
    if (!existsSync(path)) throw new Error(`Legacy Next Agent runtime missing ${path}; run pnpm build:legacy-next and pnpm electron:prepare --runtime=legacy-next`);
    return { path, kind: mode };
  }
  const manifestPath = join(appDirectory, "runtime-manifest.json");
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); }
  catch (error) {
    throw new Error(`Static Agent runtime requires ${manifestPath}; run pnpm build or pnpm electron:prepare. Legacy requires an explicit --runtime=legacy-next build. ${error.message}`, { cause: error });
  }
  if (manifest?.format !== "quicker-agent-static-runtime" || manifest.version !== 1 || manifest.next !== false) throw new Error(`Unsupported static Agent runtime manifest ${manifestPath}`);
  for (const file of ["service.mjs", "lib/service-main.mjs", "renderer/index.html"]) {
    if (!existsSync(join(appDirectory, file))) throw new Error(`Static Agent runtime missing ${join(appDirectory, file)}; run pnpm build or pnpm electron:prepare`);
  }
  return { path: join(appDirectory, "service.mjs"), kind: "static" };
}
