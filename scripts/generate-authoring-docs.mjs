#!/usr/bin/env node
/**
 * Generate consumer-specific ActionAuthoring docs from templates + ops.json.
 *
 * Usage:
 *   node scripts/generate-authoring-docs.mjs           # write only if stale (default)
 *   node scripts/generate-authoring-docs.mjs --check  # exit 1 if stale (CI)
 *   node scripts/generate-authoring-docs.mjs --force  # always rewrite outputs
 *   node scripts/generate-authoring-docs.mjs --touch path  # update stamp (MSBuild)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "docs/action-authoring-src");
const OUT_CLI = path.join(ROOT, "docs/action-authoring/cli");
const OUT_AGENT = path.join(ROOT, "docs/action-authoring/agent");
const GENERATOR = fileURLToPath(import.meta.url);

/** Normalize to LF so output matches on Linux CI and Windows (core.autocrlf). */
function normalizeEol(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** @typedef {'cli' | 'agent'} Profile */

function parseArgs(argv) {
  const touchIdx = argv.indexOf("--touch");
  return {
    check: argv.includes("--check"),
    force: argv.includes("--force"),
    touchPath: touchIdx >= 0 ? argv[touchIdx + 1] : undefined,
  };
}

/**
 * @returns {Promise<{ opsData: Record<string, unknown>; files: string[] }>}
 */
async function loadSource() {
  const opsPath = path.join(SRC, "ops.json");
  const opsData = JSON.parse(
    normalizeEol(await fs.readFile(opsPath, "utf8")),
  );
  const files = (await fs.readdir(SRC))
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort();
  return { opsData, files };
}

/**
 * @param {Record<string, unknown>} opsData
 * @param {string[]} files
 * @returns {Promise<Map<string, string>>}
 */
async function computeOutputs(opsData, files) {
  /** @type {Map<string, string>} */
  const outputs = new Map();
  for (const profile of /** @type {Profile[]} */ (["cli", "agent"])) {
    for (const file of files) {
      const src = normalizeEol(
        await fs.readFile(path.join(SRC, file), "utf8"),
      );
      const rendered = renderDoc(src, opsData, profile, file);
      outputs.set(`${profile}/${file}`, rendered);
    }
  }
  return outputs;
}

/** @param {string} dir */
async function maxMtimeMs(dir) {
  let max = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      max = Math.max(max, await maxMtimeMs(full));
      continue;
    }
    const st = await fs.stat(full);
    max = Math.max(max, st.mtimeMs);
  }
  return max;
}

/** @param {string} filePath */
async function fileMtimeMs(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Fast skip: all outputs exist and are newer than sources + generator script.
 * @param {string[]} topicFiles
 */
async function isFreshByMtime(topicFiles) {
  const srcMtime = Math.max(
    await maxMtimeMs(SRC),
    await fileMtimeMs(GENERATOR),
  );

  let minOut = Number.POSITIVE_INFINITY;
  for (const profile of /** @type {Profile[]} */ (["cli", "agent"])) {
    const outDir = profile === "cli" ? OUT_CLI : OUT_AGENT;
    for (const file of topicFiles) {
      const outPath = path.join(outDir, file);
      try {
        const st = await fs.stat(outPath);
        minOut = Math.min(minOut, st.mtimeMs);
      } catch {
        return false;
      }
    }
  }

  return minOut >= srcMtime;
}

/**
 * @param {Map<string, string>} expected
 * @returns {Promise<string[]>}
 */
async function findStale(expected) {
  /** @type {string[]} */
  const stale = [];
  for (const [rel, content] of expected) {
    const [profile, file] = rel.split("/");
    const outDir = profile === "cli" ? OUT_CLI : OUT_AGENT;
    const outPath = path.join(outDir, file);
    let existing;
    try {
      existing = await fs.readFile(outPath, "utf8");
    } catch {
      stale.push(rel);
      continue;
    }
    if (existing !== content) {
      stale.push(rel);
    }
  }
  return stale;
}

/**
 * @param {Map<string, string>} outputs
 * @param {string[]} [only]
 */
async function writeOutputs(outputs, only) {
  const allow = only ? new Set(only) : null;
  for (const [rel, content] of outputs) {
    if (allow && !allow.has(rel)) continue;
    const [profile, file] = rel.split("/");
    const outDir = profile === "cli" ? OUT_CLI : OUT_AGENT;
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, file), content, "utf8");
  }
}

/** @param {string | undefined} touchPath */
async function touchStamp(touchPath) {
  if (!touchPath) return;
  await fs.mkdir(path.dirname(touchPath), { recursive: true });
  await fs.writeFile(touchPath, `${new Date().toISOString()}\n`, "utf8");
}

/**
 * @param {{ force: boolean; touchPath?: string }} opts
 */
async function generate(opts) {
  const { opsData, files } = await loadSource();

  if (!opts.force && (await isFreshByMtime(files))) {
    console.log(
      `Action authoring docs up to date (${files.length} topics × cli + agent, skipped).`,
    );
    await touchStamp(opts.touchPath);
    return;
  }

  const expected = await computeOutputs(opsData, files);
  const stale = await findStale(expected);

  if (!opts.force && stale.length === 0) {
    console.log(
      `Action authoring docs up to date (${files.length} topics × cli + agent, skipped).`,
    );
    await touchStamp(opts.touchPath);
    return;
  }

  if (opts.force) {
    await writeOutputs(expected);
    console.log(
      `Generated ${files.length} topics → docs/action-authoring/cli/ and agent/ (forced).`,
    );
  } else {
    await writeOutputs(expected, stale);
    console.log(
      `Generated ${stale.length} file(s) → docs/action-authoring/cli/ and agent/.`,
    );
  }
  await touchStamp(opts.touchPath);
}

async function check() {
  const { opsData, files } = await loadSource();
  const expected = await computeOutputs(opsData, files);
  const stale = await findStale(expected);

  if (stale.length > 0) {
    console.error("Generated action-authoring docs are out of date:");
    for (const rel of stale.sort()) {
      console.error(`  - ${rel}`);
    }
    console.error("");
    console.error("Fix: node scripts/generate-authoring-docs.mjs");
    console.error("     pwsh scripts/Generate-ActionAuthoringDocs.ps1");
    process.exit(1);
  }

  console.log(
    `Action authoring docs up to date (${files.length} topics × cli + agent).`,
  );
}

/**
 * @param {string} text
 * @param {Record<string, unknown>} opsData
 * @param {Profile} profile
 * @param {string} file
 */
function renderDoc(text, opsData, profile, file) {
  let out = text;

  out = out.replace(
    /\{\{#only-cli\}\}([\s\S]*?)\{\{\/only-cli\}\}/g,
    profile === "cli" ? "$1" : "",
  );
  out = out.replace(
    /\{\{#only-agent\}\}([\s\S]*?)\{\{\/only-agent\}\}/g,
    profile === "agent" ? "$1" : "",
  );

  out = expandRefs(out, opsData, profile, file, 0);
  out = out.replace(/\n{3,}/g, "\n\n");
  return `${out.trimEnd()}\n`;
}

/**
 * @param {string} text
 * @param {Record<string, unknown>} opsData
 * @param {Profile} profile
 * @param {string} file
 * @param {number} depth
 */
function expandRefs(text, opsData, profile, file, depth) {
  if (depth > 8) {
    throw new Error(`Max expansion depth in ${file}`);
  }

  let out = text;

  out = out.replace(/\{\{#ref\s+([\w.-]+)\}\}/g, (_, id) => {
    const phrases = /** @type {Record<string, Record<string, string>>} */ (
      opsData.phrases
    );
    const p = phrases[id];
    if (!p) throw new Error(`Unknown phrase: ${id} (${file})`);
    const v = p[profile];
    if (v == null || v === "") return "";
    return expandRefs(v, opsData, profile, file, depth + 1);
  });

  out = out.replace(/\{\{@doc\s+([\w-]+)\}\}/g, (_, topic) =>
    renderOp("docs.get", { topic }, opsData, profile, file),
  );

  out = out.replace(/\{\{@\s+([\w.-]+)([^}]*)\}\}/g, (_, opId, rest) => {
    const params = parseParams(rest);
    return renderOp(opId, params, opsData, profile, file);
  });

  if (/\{\{#ref|\{\{@doc|\{\{@/.test(out) && depth < 8) {
    return expandRefs(out, opsData, profile, file, depth + 1);
  }

  return out;
}

/** @param {string} s */
function parseParams(s) {
  /** @type {Record<string, string>} */
  const params = {};
  const trimmed = s.trim();
  if (!trimmed) return params;

  const re = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(trimmed)) !== null) {
    params[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return params;
}

/**
 * @param {string} opId
 * @param {Record<string, string>} params
 * @param {Record<string, unknown>} opsData
 * @param {Profile} profile
 * @param {string} file
 */
function renderOp(opId, params, opsData, profile, file) {
  const ops = /** @type {Record<string, Record<string, unknown>>} */ (
    opsData.ops
  );
  const op = ops[opId];
  if (!op) throw new Error(`Unknown op: ${opId} (${file})`);

  let template = /** @type {string | null | undefined} */ (op[profile]);
  if (template == null || template === "") {
    if (profile === "agent") {
      const note = /** @type {string | undefined} */ (op.agentNote);
      if (note) return note;
      const cliTool = /** @type {string | undefined} */ (op.cliTool);
      if (cliTool) return cliTool;
      return "";
    }
    return "";
  }

  const defaults = /** @type {Record<string, string>} */ (op.defaults ?? {});
  const merged = { ...defaults, ...params };
  let result = template;
  for (const [k, v] of Object.entries(merged)) {
    result = result.split(`{{${k}}}`).join(String(v));
  }
  if (/\{\{[\w.]+\}\}/.test(result)) {
    throw new Error(
      `Unresolved placeholders in op ${opId} (${file}): ${result}`,
    );
  }
  return result;
}

const args = parseArgs(process.argv);

if (args.check) {
  check().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  generate({ force: args.force, touchPath: args.touchPath }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
