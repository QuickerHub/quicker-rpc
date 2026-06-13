#!/usr/bin/env node
/**
 * Modules whose KC docs add cross-field / protocol detail beyond step-runner get.
 * AUTHORED is discovered from references/step-modules/authored/*.md (not a manual list).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHORED_DIR,
  KEYWORDS_PATH,
  buildRefId,
  loadAuthoredModuleKeys,
} from "./step-module-authored-discovery.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = path.join(ROOT, "docs/action-authoring-src/step-module-skip.json");
const DOC_REFS_PATH = path.join(
  ROOT,
  "QuickerRpc.AgentModel/Catalog/step-module-doc-refs.json",
);
const KC_DIR = path.join(ROOT, "docs/authoring-references/step-modules/kc");

/** @param {string} filePath */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, unknown>} keywords
 * @returns {Promise<Record<string, { topic: string, file: string, tier: string }>>}
 */
async function buildDocRefs(keywords) {
  /** @type {Record<string, { topic: string, file: string, tier: string }>} */
  const refs = {};
  for (const key of Object.keys(keywords)) {
    const id = buildRefId(key);
    if (await fileExists(path.join(AUTHORED_DIR, `${id}.md`))) {
      refs[key] = { topic: "step-modules", file: id, tier: "authored" };
    } else if (await fileExists(path.join(KC_DIR, `${id}.md`))) {
      refs[key] = { topic: "step-modules", file: `kc/${id}`, tier: "kc" };
    }
  }
  return refs;
}

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

  const docRefs = await buildDocRefs(keywords);
  const generatedAt = new Date().toISOString();

  await fs.writeFile(
    OUT_PATH,
    `${JSON.stringify(
      {
        generatedAt,
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

  await fs.writeFile(
    DOC_REFS_PATH,
    `${JSON.stringify(
      {
        generatedAt,
        topic: "step-modules",
        rationale:
          "Embedded in step-runner get schema as docReference. Priority: authored > kc.",
        refs: docRefs,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `modules=${keys.length} authored=${authored.length} keep=${keep.length} skip=${skip.length} docRefs=${Object.keys(docRefs).length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
