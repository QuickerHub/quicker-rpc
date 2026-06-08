#!/usr/bin/env node
/**
 * Distill step JSON examples from QuickerModuleDoc into authored step-module references.
 *
 * Source: https://github.com/PassWordE/QuickerModuleDoc/blob/main/Doc.md
 *
 * Usage:
 *   node scripts/distill-quicker-module-doc-examples.mjs --input path/to/Doc.md
 *   node scripts/distill-quicker-module-doc-examples.mjs --input path/to/Doc.md --dry-run
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchSchemaForStep } from "./lib/step-runner-schema-cache.mjs";
import { omitDefaultsOnStep } from "./lib/omit-default-input-params.mjs";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_JSON = path.join(ROOT, "docs/action-authoring-src/step-module-skip.json");
const AUTHORED_DIR = path.join(
  ROOT,
  "docs/action-authoring-src/references/step-modules/authored",
);
const SOURCE_URL =
  "https://github.com/PassWordE/QuickerModuleDoc/blob/main/Doc.md";

/** step-modules ref ids whose protocol lives in schemas/ — skip KC distill into reference. */
/** @type {Set<string>} */
export const SCHEMA_BACKED = new Set(["form"]);

const SKIP_INPUT_KEYS = new Set(["stopIfFail"]);
const MAX_EXAMPLES_PER_MODULE = 3;
const MAX_EXAMPLE_LINES = 22;
const MAX_STRING_LEN = 120;

/**
 * @param {string[]} authoredKeys
 * @returns {Map<string, string>}
 */
function refIdByKeyFromAuthored(authoredKeys) {
  return new Map(authoredKeys.map((k) => [k, k.replace(/^sys:/, "")]));
}

/**
 * @param {Record<string, unknown>} step
 */
function exampleHint(step) {
  const input = /** @type {Record<string, string>} */ (step.inputParams ?? {});
  const bits = [];
  if (input["content.var"])
    bits.push(`content.var=${input["content.var"]}`);
  else if (input.body) bits.push(String(input.body).slice(0, 40));
  else if (input.type) bits.push(String(input.type));
  else if (input.operation) bits.push(String(input.operation));
  return bits.join(" · ");
}

/**
 * @param {string} caption
 * @param {Record<string, unknown>} step
 * @param {number} index
 */
function displayCaption(caption, step, index) {
  const short =
    caption.length > 72 ? `${caption.slice(0, 69)}…` : caption.trim();
  const hint = exampleHint(step);
  return hint && index > 0 ? `${short}（${hint}）` : short || hint || "调用示例";
}

function parseArgs(argv) {
  let input = "";
  let dryRun = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--input") input = argv[++i] ?? "";
    else if (argv[i] === "--dry-run") dryRun = true;
  }
  if (!input) {
    console.error("Missing --input <Doc.md>");
    process.exit(1);
  }
  return { input: path.resolve(input), dryRun };
}

/**
 * @param {unknown} step
 * @returns {Record<string, unknown>[]}
 */
function collectSteps(step) {
  if (!step || typeof step !== "object") return [];
  /** @type {Record<string, unknown>[]} */
  const out = [/** @type {Record<string, unknown>} */ (step)];
  for (const branch of ["IfSteps", "ElseSteps"]) {
    const kids = /** @type {unknown} */ (/** @type {Record<string, unknown>} */ (step)[branch]);
    if (!Array.isArray(kids)) continue;
    for (const child of kids) out.push(...collectSteps(child));
  }
  return out;
}

/**
 * @param {string} value
 */
function truncateValue(value) {
  const oneLine = value.replace(/\r\n/g, "\\n").replace(/\n/g, "\\n");
  if (oneLine.length <= MAX_STRING_LEN) return oneLine;
  return `${oneLine.slice(0, MAX_STRING_LEN - 3)}...`;
}

/**
 * @param {Record<string, { VarKey?: string | null; Value?: string | null }>} native
 */
function convertInputParams(native) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, cell] of Object.entries(native ?? {})) {
    if (SKIP_INPUT_KEYS.has(key) || !cell) continue;
    if (cell.VarKey) {
      out[`${key}.var`] = cell.VarKey;
      continue;
    }
    const value = cell.Value;
    if (value == null || value === "") continue;
    out[key] = truncateValue(String(value));
  }
  return out;
}

/**
 * @param {Record<string, string | null>} native
 */
function convertOutputParams(native) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, target] of Object.entries(native ?? {})) {
    if (!target) continue;
    out[key] = target;
  }
  return out;
}

/**
 * @param {Record<string, unknown>} step
 */
function convertStep(step) {
  const key = String(step.StepRunnerKey ?? "");
  /** @type {Record<string, unknown>} */
  const compressed = { stepRunnerKey: key };
  const inputParams = convertInputParams(
    /** @type {Record<string, { VarKey?: string | null; Value?: string | null }>} */ (
      step.InputParams ?? {}
    ),
  );
  const outputParams = convertOutputParams(
    /** @type {Record<string, string | null>} */ (step.OutputParams ?? {}),
  );
  if (Object.keys(inputParams).length) compressed.inputParams = inputParams;
  if (Object.keys(outputParams).length) compressed.outputParams = outputParams;
  return compressed;
}

/**
 * @param {unknown} obj
 */
function stableStringify(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`;
}

/**
 * @param {string} json
 */
function countLines(json) {
  return json.trimEnd().split("\n").length;
}

/**
 * @param {Record<string, unknown>} example
 */
function exampleFingerprint(example) {
  return JSON.stringify(example);
}

/**
 * @param {string} markdown
 */
function parseModuleSections(markdown) {
  const moduleStart = markdown.indexOf("# 模块介绍");
  const body = moduleStart >= 0 ? markdown.slice(moduleStart) : markdown;
  const sections = body.split(/\n\*\*\*\n/);

  /** @type {Map<string, { title: string; examples: { caption: string; steps: Record<string, unknown>[] }[] }>} */
  const byKey = new Map();

  for (const section of sections) {
    const keyMatch = section.match(/\*\*内部名称\*\*\s*\n>\s*(sys:[^\s]+)/);
    if (!keyMatch) continue;
    const moduleKey = keyMatch[1].trim();
    const titleMatch = section.match(/^##\s+[^\n]+\n\n\*\*功能描述\*\*/m);
    const titleLine = section.match(/^##\s+(.+)$/m);
    const title = titleLine ? titleLine[1].trim() : moduleKey;

    const exampleRegion = section.match(
      /<summary>范例<\/summary>([\s\S]*?)(?:<\/details>|\n\*\*\*|$)/,
    );
    if (!exampleRegion) continue;

    /** @type {{ caption: string; steps: Record<string, unknown>[] }[]} */
    const examples = [];
    const region = exampleRegion[1];
    const blocks = region.split(/```json\s*/);
    for (let i = 1; i < blocks.length; i++) {
      const end = blocks[i].indexOf("```");
      if (end < 0) continue;
      const rawJson = blocks[i].slice(0, end).trim();
      const captionBlock = blocks[i - 1];
      const caption =
        captionBlock
          .replace(/<[^>]+>/g, "")
          .split("\n")
          .map((l) => l.replace(/^\*\*|\*\*$/g, "").trim())
          .filter(Boolean)
          .pop() ?? "";

      let parsed;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        continue;
      }
      const steps = (parsed.Steps ?? []).flatMap((s) => collectSteps(s));
      examples.push({ caption, steps });
    }

    if (examples.length) byKey.set(moduleKey, { title, examples });
  }

  return byKey;
}

/**
 * @param {Map<string, { title: string; examples: { caption: string; steps: Record<string, unknown>[] }[] }>} sections
 * @param {Map<string, string>} refIdByKey
 * @param {{ omitSchemaDefaults?: boolean }} options
 */
async function buildExamplesByRefId(sections, refIdByKey, options = {}) {
  /** @type {Map<string, { caption: string; step: Record<string, unknown> }[]>} */
  const out = new Map();

  for (const [moduleKey, section] of sections) {
    const refId = refIdByKey.get(moduleKey);
    if (!refId || SCHEMA_BACKED.has(refId)) continue;

    /** @type {Set<string>} */
    const seen = new Set();
    /** @type { { caption: string; step: Record<string, unknown> }[] } */
    const picked = [];

    for (const ex of section.examples) {
      for (const step of ex.steps) {
        if (String(step.StepRunnerKey) !== moduleKey) continue;
        let converted = convertStep(step);
        if (options.omitSchemaDefaults !== false) {
          try {
            const schema = await fetchSchemaForStep(
              moduleKey,
              /** @type {Record<string, string>} */ (converted.inputParams ?? {}),
            );
            converted = omitDefaultsOnStep(converted, schema);
          } catch {
            // qkrpc unavailable — keep unfiltered example
          }
        }
        const fp = exampleFingerprint(converted);
        if (seen.has(fp)) continue;
        const json = stableStringify(converted);
        if (countLines(json) > MAX_EXAMPLE_LINES) continue;
        seen.add(fp);
        picked.push({
          caption: displayCaption(
            ex.caption || section.title,
            converted,
            picked.length,
          ),
          step: converted,
        });
        if (picked.length >= MAX_EXAMPLES_PER_MODULE) break;
      }
      if (picked.length >= MAX_EXAMPLES_PER_MODULE) break;
    }

    if (picked.length) out.set(refId, picked);
  }

  return out;
}

const DISTILLED_MARKER = "<!-- QuickerModuleDoc examples -->";

/**
 * @param {string} markdown
 */
function stripDistilledBlock(markdown) {
  const idx = markdown.indexOf(DISTILLED_MARKER);
  if (idx < 0) return markdown;
  const after = markdown.slice(idx + DISTILLED_MARKER.length);
  const nextSection = after.search(/\n## /);
  const end =
    nextSection >= 0 ? idx + DISTILLED_MARKER.length + nextSection : markdown.length;
  return `${markdown.slice(0, idx).trimEnd()}\n${markdown.slice(end)}`;
}

/**
 * @param {string} markdown
 * @param {{ caption: string; step: Record<string, unknown> }[]} examples
 */
function injectExamples(markdown, examples) {
  const blocks = examples.map(({ caption, step }) => {
    const title = caption.trim() || "调用示例";
    return `### ${title}\n\n\`\`\`json\n${stableStringify(step).trimEnd()}\n\`\`\``;
  });
  const sectionBody = `${DISTILLED_MARKER}\n\n${blocks.join("\n\n")}\n`;
  const cleaned = stripDistilledBlock(markdown);

  const exampleHeading = "## 示例";
  const headingIdx = cleaned.indexOf(`\n${exampleHeading}`);
  if (headingIdx >= 0) {
    const relatedIdx = cleaned.indexOf("\n## 相关", headingIdx);
    const sectionEnd = relatedIdx >= 0 ? relatedIdx : cleaned.length;
    const before = cleaned.slice(0, sectionEnd).trimEnd();
    const after = cleaned.slice(sectionEnd);
    const gap = after.startsWith("\n") ? "" : "\n";
    return `${before}\n\n${sectionBody.trimEnd()}${gap}${after}`;
  }

  const relatedIdx = cleaned.indexOf("\n## 相关");
  if (relatedIdx >= 0) {
    return `${cleaned.slice(0, relatedIdx)}\n\n## 示例\n\n${sectionBody}${cleaned.slice(relatedIdx)}`;
  }
  return `${cleaned.trimEnd()}\n\n## 示例\n\n${sectionBody}`;
}

async function main() {
  const { input, dryRun } = parseArgs(process.argv);
  const skip = JSON.parse(await fs.readFile(SKIP_JSON, "utf8"));
  const refIdByKey = refIdByKeyFromAuthored(skip.authored ?? []);
  const markdown = await fs.readFile(input, "utf8");
  const sections = parseModuleSections(markdown);
  const byRefId = await buildExamplesByRefId(sections, refIdByKey);

  let updated = 0;
  for (const [refId, examples] of [...byRefId.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const filePath = path.join(AUTHORED_DIR, `${refId}.md`);
    let body;
    try {
      body = await fs.readFile(filePath, "utf8");
    } catch {
      console.warn(`skip missing authored file: ${refId}.md`);
      continue;
    }
    const next = injectExamples(body, examples);
    if (next === body) continue;
    if (!dryRun) await fs.writeFile(filePath, next, "utf8");
    updated++;
    console.log(`${refId}: +${examples.length} example(s)`);
  }

  console.log(
    `distilled ${byRefId.size} modules, updated ${updated} files (source: ${SOURCE_URL})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
