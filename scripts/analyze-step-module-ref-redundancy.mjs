#!/usr/bin/env node
/**
 * Modules whose KC docs add cross-field / protocol detail beyond step-runner get.
 * AUTHORED is discovered from references/step-modules/authored/*.md (not a manual list).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KEYWORDS_PATH,
  loadAuthoredModuleKeys,
} from "./step-module-authored-discovery.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = path.join(ROOT, "docs/action-authoring-src/step-module-skip.json");

/** KC crawl targets (empty when all keep modules are authored). */
/** @type {Set<string>} */
export const FORCE_KEEP = new Set([]);

async function main() {
  const keywords = JSON.parse(await fs.readFile(KEYWORDS_PATH, "utf8"));
  const authoredKeys = await loadAuthoredModuleKeys(keywords);
  const keys = Object.keys(keywords);
  const authored = keys.filter((k) => authoredKeys.has(k)).sort();
  const skip = keys
    .filter((k) => !FORCE_KEEP.has(k) && !authoredKeys.has(k))
    .sort();
  const keep = keys.filter((k) => FORCE_KEEP.has(k)).sort();

  await fs.writeFile(
    OUT_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        rationale:
          "Per-module reference omitted when qkrpc_step_runner_get input/output purpose fields are sufficient. KEEP = KC crawl (docs:modules:gen). AUTHORED = any references/step-modules/authored/<id>.md (auto-discovered).",
        authored,
        skip,
        keep,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `modules=${keys.length} authored=${authored.length} keep=${keep.length} skip=${skip.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
