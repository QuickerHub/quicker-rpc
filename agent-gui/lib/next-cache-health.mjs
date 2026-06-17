import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MANIFEST_FILES = [
  "routes-manifest.json",
  "required-server-files.json",
];

function hasCompiledServerOutput(nextDir) {
  const appPage = join(nextDir, "server", "app", "page.js");
  if (existsSync(appPage)) return true;

  const pagesManifest = join(nextDir, "server", "pages-manifest.json");
  if (existsSync(pagesManifest)) return true;

  const appPathsManifest = join(nextDir, "server", "app-paths-manifest.json");
  return existsSync(appPathsManifest);
}

/** True when .next has server bundles but dev manifests were deleted mid-compile. */
export function nextCacheIsCorrupt(nextDir) {
  if (!existsSync(nextDir)) return false;
  if (!hasCompiledServerOutput(nextDir)) return false;

  return MANIFEST_FILES.some((name) => !existsSync(join(nextDir, name)));
}

export function describeNextCacheCorruption(nextDir) {
  const missing = MANIFEST_FILES.filter(
    (name) => !existsSync(join(nextDir, name)),
  );
  if (missing.length === 0) return "missing dev manifests";
  return `missing ${missing.join(", ")}`;
}

export function nextCacheReferencesTurbopackRuntime(nextDir) {
  const documentJs = join(nextDir, "server", "pages", "_document.js");
  if (!existsSync(documentJs)) return false;
  try {
    return readFileSync(documentJs, "utf8").includes("[turbopack]_runtime");
  } catch {
    return false;
  }
}

export function nextCacheHasTurbopackRuntimeChunk(nextDir) {
  if (existsSync(join(nextDir, "turbopack"))) return true;
  try {
    const ssrChunks = join(nextDir, "server", "chunks", "ssr");
    return readdirSync(ssrChunks).some((name) =>
      name.includes("[turbopack]_runtime"),
    );
  } catch {
    return false;
  }
}

/** _document.js points at [turbopack]_runtime.js but the chunk was deleted mid-dev. */
export function nextCacheHasBrokenTurbopackRuntime(nextDir) {
  return (
    nextCacheReferencesTurbopackRuntime(nextDir)
    && !nextCacheHasTurbopackRuntimeChunk(nextDir)
  );
}

export function logChunkIndicatesCorruptNextCache(chunk) {
  const text = chunk.replace(/\u001b\[[0-9;]*m/g, "");
  if (text.includes("React Client Manifest")) return true;
  if (text.includes("builtin/global-error")) return true;
  if (!text.includes("ENOENT")) return false;
  if (!text.includes(".next")) return false;
  return (
    text.includes("routes-manifest.json")
    || text.includes("required-server-files.json")
    || text.includes("app-paths-manifest.json")
    || text.includes("pages-manifest.json")
    || text.includes("pages/_document.js")
  );
}
