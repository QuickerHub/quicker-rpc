#!/usr/bin/env node
/**
 * Compress JSON examples in step-modules authored refs: omit inputParams equal to step-runner schema defaults.
 *
 * Requires qkrpc + Quicker plugin (step-runner get).
 *
 * Usage:
 *   node scripts/compress-module-ref-examples.mjs
 *   node scripts/compress-module-ref-examples.mjs --dry-run
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSchemaForStep } from "./lib/step-runner-schema-cache.mjs";
import { omitDefaultsOnStep } from "./lib/omit-default-input-params.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTHORED_DIR = path.join(
  ROOT,
  "docs/action-authoring-src/references/step-modules/authored",
);
const EXAMPLES_DIR = path.join(
  ROOT,
  "docs/action-authoring-src/references/step-modules/examples",
);

/**
 * @param {string} jsonText
 */
function parseStepJson(jsonText) {
  const obj = JSON.parse(jsonText);
  if (!obj?.stepRunnerKey) return null;
  return obj;
}

/**
 * @param {Record<string, unknown>} step
 */
function stableStepJson(step) {
  const ordered = { stepRunnerKey: step.stepRunnerKey };
  if (step.inputParams && Object.keys(step.inputParams).length) {
    ordered.inputParams = step.inputParams;
  }
  if (step.outputParams && Object.keys(step.outputParams).length) {
    ordered.outputParams = step.outputParams;
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/**
 * @param {string} markdown
 */
async function compressMarkdownExamples(markdown) {
  const re = /```json\n([\s\S]*?)```/g;
  /** @type {{ kind: "text"; value: string } | { kind: "json"; value: string }}[]} */
  const parts = [];
  let lastIndex = 0;
  /** @type {RegExpExecArray | null} */
  let match;

  while ((match = re.exec(markdown)) !== null) {
    parts.push({ kind: "text", value: markdown.slice(lastIndex, match.index) });
    const raw = match[1].trim();
    let nextJson = raw;
    try {
      const step = parseStepJson(raw);
      if (step) {
        const key = String(step.stepRunnerKey);
        const inputParams = /** @type {Record<string, string>} */ (
          step.inputParams ?? {}
        );
        const schema = await fetchSchemaForStep(key, inputParams);
        nextJson = stableStepJson(omitDefaultsOnStep(step, schema)).trimEnd();
      }
    } catch (e) {
      console.warn(`json block: skip (${/** @type {Error} */ (e).message})`);
    }
    parts.push({ kind: "json", value: nextJson });
    lastIndex = re.lastIndex;
  }

  parts.push({ kind: "text", value: markdown.slice(lastIndex) });

  return parts
    .map((part) =>
      part.kind === "text"
        ? part.value
        : `\`\`\`json\n${part.value}\n\`\`\``,
    )
    .join("");
}

async function compressDir(dir, label) {
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return 0;
  }
  let updated = 0;
  const dryRun = process.argv.includes("--dry-run");

  for (const name of entries.sort()) {
    if (!name.endsWith(".md") || name === "SPEC.md") continue;
    const filePath = path.join(dir, name);
    const body = await fs.readFile(filePath, "utf8");
    if (!body.includes("```json")) continue;

    const next = await compressMarkdownExamples(body);
    if (next === body) continue;

    if (!dryRun) await fs.writeFile(filePath, next, "utf8");
    updated++;
    console.log(`${label}/${name}`);
  }
  return updated;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const a = await compressDir(AUTHORED_DIR, "authored");
  const b = await compressDir(EXAMPLES_DIR, "examples");
  console.log(
    `compressed ${a + b} file(s)${dryRun ? " (dry-run)" : ""}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
