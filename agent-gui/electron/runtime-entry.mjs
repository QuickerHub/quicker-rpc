import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Legacy staging remains selectable until combined Designer and installer acceptance. */
export function resolveRuntimeEntry(appDirectory) {
  const manifestPath = join(appDirectory, "runtime-manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.format !== "quicker-agent-static-runtime" || manifest.version !== 1 || manifest.next !== false) {
      throw new Error("Unsupported static Agent runtime manifest");
    }
    for (const file of ["service.mjs", "lib/service-main.mjs", "renderer/index.html"]) {
      if (!existsSync(join(appDirectory, file))) throw new Error(`Static Agent runtime missing ${file}`);
    }
    return { path: join(appDirectory, "service.mjs"), kind: "static" };
  }
  return { path: join(appDirectory, "server.js"), kind: "legacy-next" };
}
