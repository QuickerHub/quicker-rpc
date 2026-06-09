#!/usr/bin/env node
/**
 * Generate consumer-specific ActionAuthoring docs from manifest + templates.
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
const MANIFEST = path.join(SRC, "manifest");
const SRC_PARTIALS = path.join(SRC, "partials");
const SKILL_SRC = path.join(SRC, "skills/quicker-authoring/SKILL.src.md");
const PROMPT_TIER0_SRC = path.join(
  SRC,
  "skills/quicker-authoring/prompt-tier0.src.md",
);
const OUT_CLI = path.join(ROOT, "docs/action-authoring/cli");
const OUT_SKILLS = path.join(ROOT, "docs/skills/quicker-authoring");
const SKILL_NAME = "quicker-authoring";
const SRC_REF = path.join(SRC, "references");
const GENERATOR = fileURLToPath(import.meta.url);

/** Normalize to LF so output matches on Linux CI and Windows (core.autocrlf). */
function normalizeEol(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Stable key order for JSON snapshots (CI vs local readdir). */
function sortRecordKeys(record) {
  /** @type {Record<string, string>} */
  const sorted = {};
  for (const key of Object.keys(record).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  )) {
    sorted[key] = record[key];
  }
  return sorted;
}

/** @typedef {'cli' | 'agent'} Profile */

/**
 * @param {Record<string, unknown>} meta
 * @param {string} body
 * @param {string} skillName
 */
function buildSkillFrontmatter(meta, body, skillName) {
  if (!meta?.description) {
    throw new Error("Missing skill.description in manifest/skill.json");
  }

  const description = String(meta.description).trim();
  if (description.length === 0 || description.length > 1024) {
    throw new Error(
      `skill.description must be 1–1024 chars (got ${description.length})`,
    );
  }

  const lines = [
    "---",
    `name: ${skillName}`,
    `description: ${yamlDoubleQuote(description)}`,
  ];

  const allowedTools = meta["allowed-tools"];
  if (typeof allowedTools === "string" && allowedTools.trim()) {
    lines.push(`allowed-tools: ${allowedTools.trim()}`);
  }

  const compatibility = meta.compatibility;
  if (typeof compatibility === "string" && compatibility.trim()) {
    lines.push(`compatibility: ${yamlDoubleQuote(compatibility.trim())}`);
  }

  const metadata = meta.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    lines.push("metadata:");
    for (const [k, v] of Object.entries(
      /** @type {Record<string, unknown>} */ (metadata),
    )) {
      lines.push(`  ${k}: ${yamlDoubleQuote(String(v))}`);
    }
  }

  lines.push("---", "", body.trimEnd(), "");
  return `${lines.join("\n")}\n`;
}

/**
 * @param {Record<string, unknown>} opsData
 * @param {string} topic
 * @param {string} body
 * @param {{ skillName?: string }} [opts]
 */
function buildSkillMd(opsData, topic, body, opts = {}) {
  const topics = /** @type {Record<string, Record<string, unknown>>} */ (
    opsData.topics ?? {}
  );
  const meta = topics[topic];
  const skillName = opts.skillName ?? topic;
  return buildSkillFrontmatter(meta, body, skillName);
}

/** @param {Record<string, unknown>} opsData @param {string} body */
function buildSkillEntryMd(opsData, body) {
  const skill = /** @type {Record<string, unknown>} */ (opsData.skill ?? {});
  const skillName = String(skill.name ?? SKILL_NAME).trim();
  if (!skillName) {
    throw new Error("Missing skill.name in manifest/skill.json");
  }
  return buildSkillFrontmatter(skill, body, skillName);
}

/** @param {string} value */
function yamlDoubleQuote(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

/**
 * @param {Record<string, unknown>} opsData
 * @param {string} topic
 * @returns {Record<string, unknown>}
 */
function buildTopicManifestEntry(opsData, topic) {
  const topics = /** @type {Record<string, Record<string, unknown>>} */ (
    opsData.topics ?? {}
  );
  const meta = topics[topic];
  if (!meta?.description) {
    throw new Error(`Missing topics.${topic}.description in manifest/topics.json`);
  }
  if (!meta?.title) {
    throw new Error(`Missing topics.${topic}.title in manifest/topics.json`);
  }

  const templateSource =
    typeof meta.source === "string" ? String(meta.source).trim() : `${topic}.md`;

  /** @type {Record<string, unknown>} */
  const entry = {
    topic,
    title: String(meta.title).trim(),
    description: String(meta.description).trim(),
    source: `references/${topic}.md`,
    templateSource,
  };

  const allowedTools = meta["allowed-tools"];
  if (typeof allowedTools === "string" && allowedTools.trim()) {
    entry.allowedTools = allowedTools.trim();
  }

  const compatibility = meta.compatibility;
  if (typeof compatibility === "string" && compatibility.trim()) {
    entry.compatibility = compatibility.trim();
  }

  const metadata = meta.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    entry.metadata = metadata;
    const layer = /** @type {Record<string, unknown>} */ (metadata).layer;
    if (typeof layer === "string" && layer.trim()) {
      entry.layer = layer.trim();
    }
  }

  const searchAliases = meta.searchAliases;
  if (Array.isArray(searchAliases) && searchAliases.length > 0) {
    entry.searchAliases = searchAliases
      .map((a) => String(a).trim())
      .filter((a) => a.length > 0);
  }

  return entry;
}

function isCliOnlyTopic(opsData, topic) {
  const topics = /** @type {Record<string, Record<string, unknown>>} */ (
    opsData.topics ?? {}
  );
  const profiles = topics[topic]?.profiles;
  if (!Array.isArray(profiles)) return false;
  return profiles.length === 1 && String(profiles[0]).toLowerCase() === "cli";
}

function parseArgs(argv) {
  const touchIdx = argv.indexOf("--touch");
  return {
    check: argv.includes("--check"),
    force: argv.includes("--force"),
    touchPath: touchIdx >= 0 ? argv[touchIdx + 1] : undefined,
  };
}

/**
 * @typedef {{ topic: string; source: string }} TopicEntry
 * @returns {Promise<{ opsData: Record<string, unknown>; topicEntries: TopicEntry[] }>}
 */
async function loadSource() {
  const readJson = async (name) =>
    JSON.parse(
      normalizeEol(await fs.readFile(path.join(MANIFEST, name), "utf8")),
    );

  const opsData = {
    skill: await readJson("skill.json"),
    topics: await readJson("topics.json"),
    phrases: await readJson("phrases.json"),
    ops: await readJson("operations.json"),
  };

  const topics = /** @type {Record<string, Record<string, unknown>>} */ (
    opsData.topics ?? {}
  );
  /** @type {TopicEntry[]} */
  const topicEntries = [];
  for (const topic of Object.keys(topics).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  )) {
    const meta = topics[topic];
    const source =
      typeof meta?.source === "string"
        ? String(meta.source).trim()
        : `${topic}.md`;
    try {
      await fs.access(path.join(SRC, source));
    } catch {
      throw new Error(`Missing template for topic ${topic}: ${source}`);
    }
    topicEntries.push({ topic, source });
  }

  return { opsData, topicEntries };
}

/** @returns {Promise<Map<string, string>>} */
async function loadPartials() {
  /** @type {Map<string, string>} */
  const map = new Map();
  let entries;
  try {
    entries = await fs.readdir(SRC_PARTIALS);
  } catch {
    return map;
  }
  for (const fname of entries.sort()) {
    if (!fname.endsWith(".md")) continue;
    const name = fname.slice(0, -3);
    map.set(
      name,
      normalizeEol(await fs.readFile(path.join(SRC_PARTIALS, fname), "utf8")),
    );
  }
  return map;
}

/** @param {string} markdown */
/** @param {string} markdown @param {string[]} aliases */
function injectSearchAliases(markdown, aliases) {
  if (!aliases.length) {
    return markdown;
  }

  const tag = `<!-- qkrpc-search-aliases: ${aliases.join(", ")} -->\n`;
  const newline = markdown.indexOf("\n");
  if (newline < 0) {
    return `${markdown}\n${tag}`;
  }

  return `${markdown.slice(0, newline + 1)}${tag}${markdown.slice(newline + 1)}`;
}

function extractMarkdownTitle(markdown) {
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim();
    }
  }
  return "";
}

/**
 * @param {string} topic
 * @returns {Promise<Map<string, { src: string, outRel: string }>>}
 */
async function loadReferenceMap(topic) {
  /** @type {Map<string, { src: string, outRel: string }>} */
  const map = new Map();

  let entries;
  try {
    entries = (await fs.readdir(SRC_REF)).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  } catch {
    entries = [];
  }

  const prefix = `${topic}.`;
  for (const fname of entries) {
    if (!fname.startsWith(prefix) || !fname.endsWith(".md")) continue;
    const refName = fname.slice(prefix.length, -3);
    const raw = normalizeEol(
      await fs.readFile(path.join(SRC_REF, fname), "utf8"),
    );
    map.set(refName, { src: raw, outRel: `${refName}.md` });
  }

  const topicDir = path.join(SRC_REF, topic);
  try {
    const subEntries = (await fs.readdir(topicDir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    const refSubdirs = subEntries
      .filter((ent) => ent.isDirectory())
      .sort((a, b) => {
        const order = { authored: 0, examples: 1, kc: 2 };
        const ak = order[a.name.toLowerCase()] ?? 9;
        const bk = order[b.name.toLowerCase()] ?? 9;
        return ak - bk || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

    for (const ent of refSubdirs) {
      const subName = ent.name.toLowerCase();
      if (subName !== "authored" && subName !== "examples" && subName !== "kc") continue;
      const subDir = path.join(topicDir, ent.name);
      const subFiles = (await fs.readdir(subDir)).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      );
      for (const fname of subFiles) {
        if (
          !fname.endsWith(".md")
          || fname.toLowerCase() === "readme.md"
          || fname.toUpperCase() === "SPEC.MD"
        ) {
          continue;
        }
        const baseId = fname.slice(0, -3);
        const refName =
          subName === "kc"
            ? `kc/${baseId}`
            : subName === "examples"
              ? `examples/${baseId}`
              : baseId;
        if (map.has(refName)) {
          throw new Error(
            `Duplicate reference id "${refName}" for topic ${topic} (${subName} + other)`,
          );
        }
        const raw = normalizeEol(
          await fs.readFile(path.join(subDir, fname), "utf8"),
        );
        map.set(refName, {
          src: raw,
          outRel: `${topic}/${subName}/${baseId}.md`,
        });
      }
      continue;
    }

    for (const ent of subEntries) {
      if (ent.isDirectory()) continue;
      if (!ent.name.endsWith(".md") || ent.name.toLowerCase() === "readme.md") {
        continue;
      }
      const refName = ent.name.slice(0, -3);
      if (map.has(refName)) {
        throw new Error(
          `Duplicate reference id "${refName}" for topic ${topic} (flat + subdir)`,
        );
      }
      const raw = normalizeEol(
        await fs.readFile(path.join(topicDir, ent.name), "utf8"),
      );
      map.set(refName, { src: raw, outRel: `${topic}/${refName}.md` });
    }
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== "ENOENT") {
      throw err;
    }
  }

  return map;
}

async function loadReferenceSearchAliases() {
  try {
    const raw = normalizeEol(
      await fs.readFile(
        path.join(MANIFEST, "reference-search-aliases.json"),
        "utf8",
      ),
    );
    return /** @type {Record<string, Record<string, string[]>>} */ (
      JSON.parse(raw)
    );
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, unknown>} opsData
 * @param {TopicEntry[]} topicEntries
 * @returns {Promise<Map<string, string>>}
 */
async function computeOutputs(opsData, topicEntries) {
  /** @type {Map<string, string>} */
  const outputs = new Map();
  /** @type {Record<string, unknown>[]} */
  const topicManifest = [];
  /** @type {Record<string, string>} */
  const referenceFiles = {};
  /** @type {Record<string, { id: string, title: string, path: string, searchAliases?: string[] }[]>} */
  const referenceCatalog = {};

  const partials = await loadPartials();
  const referenceSearchAliases = await loadReferenceSearchAliases();

  for (const { topic, source } of topicEntries) {
    const src = normalizeEol(
      await fs.readFile(path.join(SRC, source), "utf8"),
    );
    const refMap = await loadReferenceMap(topic);

    const cliRendered = renderDoc(
      src,
      opsData,
      "cli",
      source,
      refMap,
      partials,
    );
    const topicsMeta = /** @type {Record<string, Record<string, unknown>>} */ (
      opsData.topics ?? {}
    );
    const topicMeta = topicsMeta[topic];
    const topicAliases = Array.isArray(topicMeta?.searchAliases)
      ? topicMeta.searchAliases
          .map((a) => String(a).trim())
          .filter((a) => a.length > 0)
      : [];
    outputs.set(
      `cli/${topic}.md`,
      injectSearchAliases(cliRendered, topicAliases),
    );

    const cliOnly = isCliOnlyTopic(opsData, topic);
    if (cliOnly) continue;

    const agentBody = renderDoc(
      src,
      opsData,
      "agent",
      source,
      refMap,
      partials,
    );
    topicManifest.push(buildTopicManifestEntry(opsData, topic));

    outputs.set(
      `skills/references/${topic}.md`,
      `${agentBody.trimEnd()}\n`,
    );

    for (const [refName, refEntry] of refMap) {
      const refAgent = renderDoc(
        refEntry.src,
        opsData,
        "agent",
        `${source}#ref:${refName}`,
        refMap,
        partials,
      );
      outputs.set(
        `skills/references/${refEntry.outRel}`,
        `${refAgent.trimEnd()}\n`,
      );
      referenceFiles[refName] = topic;
      if (!referenceCatalog[topic]) {
        referenceCatalog[topic] = [];
      }
      /** @type {{ id: string, title: string, path: string, searchAliases?: string[] }} */
      const catalogEntry = {
        id: refName,
        title: extractMarkdownTitle(refAgent) || refName,
        path: refEntry.outRel,
      };
      const aliasKey = refName.startsWith("kc/")
        ? refName.slice("kc/".length)
        : refName;
      const refAliases = referenceSearchAliases[topic]?.[aliasKey];
      if (Array.isArray(refAliases) && refAliases.length > 0) {
        catalogEntry.searchAliases = refAliases
          .map((a) => String(a).trim())
          .filter((a) => a.length > 0);
      }
      referenceCatalog[topic].push(catalogEntry);
    }
  }

  for (const list of Object.values(referenceCatalog)) {
    list.sort((a, b) =>
      a.id.localeCompare(b.id, undefined, { sensitivity: "base" }),
    );
  }

  let skillSrc;
  try {
    skillSrc = normalizeEol(await fs.readFile(SKILL_SRC, "utf8"));
  } catch {
    throw new Error(`Missing skill source: ${SKILL_SRC}`);
  }

  const skillBody = renderDoc(
    skillSrc,
    opsData,
    "agent",
    "skills/quicker-authoring/SKILL.src.md",
    new Map(),
    partials,
  );
  const skillMd = buildSkillEntryMd(opsData, skillBody);
  const skillBodyLines = skillBody.trim().split("\n").length;
  if (skillBodyLines > 200) {
    throw new Error(
      `SKILL.src.md body too long (${skillBodyLines} lines; keep router ≤200)`,
    );
  }

  outputs.set("skills/SKILL.md", skillMd);

  let promptTier0Src;
  try {
    promptTier0Src = normalizeEol(await fs.readFile(PROMPT_TIER0_SRC, "utf8"));
  } catch {
    throw new Error(`Missing prompt tier0 source: ${PROMPT_TIER0_SRC}`);
  }

  const promptTier0Body = renderDoc(
    promptTier0Src,
    opsData,
    "agent",
    "skills/quicker-authoring/prompt-tier0.src.md",
    new Map(),
    partials,
  );
  const promptTier0Lines = promptTier0Body.trim().split("\n").length;
  if (promptTier0Lines > 120) {
    throw new Error(
      `prompt-tier0.src.md body too long (${promptTier0Lines} lines; keep tier0 ≤120)`,
    );
  }
  outputs.set("skills/prompt-tier0.md", `${promptTier0Body.trimEnd()}\n`);

  outputs.set(
    "skills/topics.json",
    `${JSON.stringify(
      {
        skillName: SKILL_NAME,
        topics: topicManifest,
        referenceFiles: sortRecordKeys(referenceFiles),
        referenceCatalog,
      },
      null,
      2,
    )}\n`,
  );

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
 * @param {TopicEntry[]} topicEntries
 */
async function isFreshByMtime(topicEntries) {
  const srcMtime = Math.max(
    await maxMtimeMs(SRC),
    await fileMtimeMs(GENERATOR),
  );

  const { opsData } = await loadSource();
  const expected = await computeOutputs(opsData, topicEntries);

  let minOut = Number.POSITIVE_INFINITY;
  for (const rel of expected.keys()) {
    const outPath = resolveOutputPath(rel);
    if (!outPath) return false;
    try {
      const st = await fs.stat(outPath);
      minOut = Math.min(minOut, st.mtimeMs);
    } catch {
      return false;
    }
  }

  return minOut >= srcMtime;
}

/** @param {string} rel */
function resolveOutputPath(rel) {
  if (rel.startsWith("cli/")) {
    return path.join(OUT_CLI, rel.slice("cli/".length));
  }
  if (rel === "skills/SKILL.md") {
    return path.join(OUT_SKILLS, "SKILL.md");
  }
  if (rel === "skills/topics.json") {
    return path.join(OUT_SKILLS, "topics.json");
  }
  if (rel === "skills/prompt-tier0.md") {
    return path.join(OUT_SKILLS, "prompt-tier0.md");
  }
  if (rel.startsWith("skills/references/")) {
    return path.join(OUT_SKILLS, "references", rel.slice("skills/references/".length));
  }
  return null;
}

/**
 * @param {Map<string, string>} expected
 * @returns {Promise<string[]>}
 */
async function findStale(expected) {
  /** @type {string[]} */
  const stale = [];
  for (const [rel, content] of expected) {
    const outPath = resolveOutputPath(rel);
    if (!outPath) {
      stale.push(rel);
      continue;
    }
    let existing;
    try {
      existing = await fs.readFile(outPath, "utf8");
    } catch {
      stale.push(rel);
      continue;
    }
    if (normalizeEol(existing) !== content) {
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
    const outPath = resolveOutputPath(rel);
    if (!outPath) continue;
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, content, "utf8");
  }
}

// Legacy flat agent/*.md removed — agent-ui reads docs/skills/quicker-authoring/SKILL.md + references/
const OUT_AGENT_LEGACY = path.join(ROOT, "docs/action-authoring/agent");

/** Remove flat agent/*.md outputs from the pre-skills layout. */
async function removeLegacyAgentOutputs() {
  try {
    await fs.rm(OUT_AGENT_LEGACY, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * @param {string} dir
 * @param {Set<string>} expectedRel
 * @param {string} relPrefix
 */
async function pruneReferenceTree(dir, expectedRel, relPrefix) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await pruneReferenceTree(full, expectedRel, rel);
      try {
        const left = await fs.readdir(full);
        if (left.length === 0) {
          await fs.rmdir(full);
        }
      } catch {
        // ignore
      }
      continue;
    }
    if (!ent.name.endsWith(".md")) continue;
    if (!expectedRel.has(rel.toLowerCase())) {
      await fs.rm(full, { force: true });
    }
  }
}

/** Drop stale cli/*.md, references/*.md, and legacy per-topic skill dirs. */
async function pruneOrphanOutputs(topicEntries, opsData) {
  const topics = new Set(topicEntries.map(({ topic }) => topic.toLowerCase()));
  const agentReferenceTopics = new Set(
    topicEntries
      .map(({ topic }) => topic)
      .filter((t) => !isCliOnlyTopic(opsData, t))
      .map((t) => t.toLowerCase()),
  );
  /** @type {Set<string>} */
  const expectedReferenceRelPaths = new Set();
  for (const t of agentReferenceTopics) {
    expectedReferenceRelPaths.add(`${t}.md`);
  }
  for (const { topic } of topicEntries) {
    if (isCliOnlyTopic(opsData, topic)) continue;
    const refMap = await loadReferenceMap(topic);
    for (const refEntry of refMap.values()) {
      expectedReferenceRelPaths.add(refEntry.outRel.toLowerCase());
    }
  }

  try {
    for (const f of await fs.readdir(OUT_CLI)) {
      if (!f.endsWith(".md")) continue;
      const topic = f.replace(/\.md$/i, "").toLowerCase();
      if (!topics.has(topic)) {
        await fs.rm(path.join(OUT_CLI, f), { force: true });
      }
    }
  } catch {
    // ignore
  }

  await pruneReferenceTree(
    path.join(OUT_SKILLS, "references"),
    expectedReferenceRelPaths,
    "",
  );

  try {
    for (const ent of await fs.readdir(OUT_SKILLS, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (ent.name === "references") continue;
      await fs.rm(path.join(OUT_SKILLS, ent.name), {
        recursive: true,
        force: true,
      });
    }
  } catch {
    // ignore
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
  const { opsData, topicEntries } = await loadSource();

  if (!opts.force && (await isFreshByMtime(topicEntries))) {
    console.log(
      `Action authoring docs up to date (${topicEntries.length} topics × cli + single skill, skipped).`,
    );
    await touchStamp(opts.touchPath);
    return;
  }

  const expected = await computeOutputs(opsData, topicEntries);
  const stale = await findStale(expected);

  if (!opts.force && stale.length === 0) {
    console.log(
      `Action authoring docs up to date (${topicEntries.length} topics × cli + single skill, skipped).`,
    );
    await touchStamp(opts.touchPath);
    return;
  }

  if (opts.force) {
    await writeOutputs(expected);
    await pruneOrphanOutputs(topicEntries, opsData);
    await removeLegacyAgentOutputs();
    console.log(
      `Generated ${topicEntries.length} topics → docs/action-authoring/cli/ and docs/skills/quicker-authoring/ (single skill, forced).`,
    );
  } else {
    await writeOutputs(expected, stale);
    if (stale.length > 0) {
      await pruneOrphanOutputs(topicEntries, opsData);
    }
    if (stale.some((rel) => rel.startsWith("skills/"))) {
      await removeLegacyAgentOutputs();
    }
    console.log(
      `Generated ${stale.length} file(s) → docs/action-authoring/cli/ and docs/skills/quicker-authoring/ (single skill).`,
    );
  }
  await touchStamp(opts.touchPath);
}

async function check() {
  const { opsData, topicEntries } = await loadSource();
  const expected = await computeOutputs(opsData, topicEntries);
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

  const validationErrors = await validateManifestAndOutputs(opsData);
  if (validationErrors.length > 0) {
    console.error("Action authoring manifest / output validation failed:");
    for (const msg of validationErrors) {
      console.error(`  - ${msg}`);
    }
    process.exit(1);
  }

  console.log(
    `Action authoring docs up to date (${topicEntries.length} topics × cli + single skill).`,
  );
}

const SKILL_MAX_LINES = 150;
const WORKFLOW_MAX_LINES = 500;
const USE_WHEN_RE = /use when|use before|use after|prefer before/i;

/**
 * @param {Record<string, unknown>} opsData
 * @returns {Promise<string[]>}
 */
async function validateManifestAndOutputs(opsData) {
  /** @type {string[]} */
  const errors = [];
  const topics = /** @type {Record<string, Record<string, unknown>>} */ (
    opsData.topics ?? {}
  );

  for (const [topicId, meta] of Object.entries(topics)) {
    const description = String(meta.description ?? "").trim();
    if (!description) {
      errors.push(`topics.${topicId}.description is empty`);
      continue;
    }
    if (description.length > 1024) {
      errors.push(
        `topics.${topicId}.description exceeds 1024 chars (${description.length})`,
      );
    }
    if (!isCliOnlyTopic(opsData, topicId) && !USE_WHEN_RE.test(description)) {
      errors.push(
        `topics.${topicId}.description must include a WHEN trigger (Use when/before/after/prefer before)`,
      );
    }
  }

  try {
    const skillMd = normalizeEol(
      await fs.readFile(path.join(OUT_SKILLS, "SKILL.md"), "utf8"),
    );
    const skillLines = skillMd.split("\n").length;
    if (skillLines > SKILL_MAX_LINES) {
      errors.push(
        `SKILL.md has ${skillLines} lines (max ${SKILL_MAX_LINES})`,
      );
    }
  } catch (err) {
    errors.push(`SKILL.md unreadable: ${/** @type {Error} */ (err).message}`);
  }

  for (const [topicId, meta] of Object.entries(topics)) {
    const layer = /** @type {Record<string, unknown>} */ (
      meta.metadata ?? {}
    ).layer;
    if (layer !== "workflow") continue;

    const refPath = path.join(OUT_SKILLS, "references", `${topicId}.md`);
    try {
      const body = normalizeEol(await fs.readFile(refPath, "utf8"));
      const lineCount = body.split("\n").length;
      if (lineCount > WORKFLOW_MAX_LINES) {
        errors.push(
          `references/${topicId}.md has ${lineCount} lines (workflow max ${WORKFLOW_MAX_LINES})`,
        );
      }
    } catch (err) {
      errors.push(
        `references/${topicId}.md unreadable: ${/** @type {Error} */ (err).message}`,
      );
    }
  }

  return errors;
}

/**
 * @param {string} text
 * @param {Record<string, unknown>} opsData
 * @param {Profile} profile
 * @param {string} file
 */
/** @param {string} file @param {Record<string, unknown>} opsData */
function topicIdFromFile(file, opsData) {
  const base = file.includes("#") ? file.split("#")[0] : file;
  const normalized = base.replace(/\\/g, "/");
  const topics = /** @type {Record<string, Record<string, unknown>>} */ (
    opsData?.topics ?? {}
  );
  for (const [id, meta] of Object.entries(topics)) {
    const source =
      typeof meta.source === "string" ? String(meta.source).trim() : `${id}.md`;
    if (source.replace(/\\/g, "/") === normalized) {
      return id;
    }
  }
  const basename = path.basename(normalized, ".md");
  if (topics[basename]) return basename;
  return basename;
}

/**
 * @param {Record<string, unknown>} opsData
 * @param {string} topic
 */
function getTopicTitle(opsData, topic) {
  const topics = /** @type {Record<string, Record<string, unknown>>} */ (
    opsData.topics ?? {}
  );
  const meta = topics[topic];
  if (!meta?.title) {
    throw new Error(`Missing topics.${topic}.title in manifest/topics.json`);
  }
  return String(meta.title).trim();
}

function renderDoc(text, opsData, profile, file, refMap = new Map(), partials = new Map()) {
  let out = text;

  out = out.replace(/\{\{#topic-title\}\}/g, () =>
    getTopicTitle(opsData, topicIdFromFile(file, opsData)),
  );

  out = out.replace(
    /\{\{#only-cli\}\}([\s\S]*?)\{\{\/only-cli\}\}/g,
    profile === "cli" ? "$1" : "",
  );
  out = out.replace(
    /\{\{#only-agent\}\}([\s\S]*?)\{\{\/only-agent\}\}/g,
    profile === "agent" ? "$1" : "",
  );

  out = out.replace(/\{\{#include-partial\s+([\w-]+)\}\}/g, (_, name) => {
    const partial = partials.get(name);
    if (!partial) {
      throw new Error(`Missing partial ${name} for ${file}`);
    }
    return renderDoc(
      partial,
      opsData,
      profile,
      `${file}#partial:${name}`,
      refMap,
      partials,
    ).trim();
  });

  out = out.replace(/\{\{#include-reference\s+([\w-]+)\}\}/g, (_, refName) => {
    const refEntry = refMap.get(refName);
    if (!refEntry) {
      throw new Error(`Missing reference ${refName} for ${file}`);
    }
    return renderDoc(
      refEntry.src,
      opsData,
      profile,
      `${file}#ref:${refName}`,
      refMap,
      partials,
    ).trim();
  });

  out = expandRefs(out, opsData, profile, file, 0, refMap, partials);
  out = out.replace(/\n{3,}/g, "\n\n").trimEnd();
  return out ? `${out}\n` : "\n";
}

/**
 * @param {string} text
 * @param {Record<string, unknown>} opsData
 * @param {Profile} profile
 * @param {string} file
 * @param {number} depth
 */
function expandRefs(text, opsData, profile, file, depth, refMap = new Map(), partials = new Map()) {
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
    return expandRefs(v, opsData, profile, file, depth + 1, refMap, partials);
  });

  out = out.replace(/\{\{@doc\s+([\w-]+)\}\}/g, (_, topic) =>
    renderOp("docs.get", { topic }, opsData, profile, file),
  );

  out = out.replace(/\{\{@\s+([\w.-]+)([^}]*)\}\}/g, (_, opId, rest) => {
    const params = parseParams(rest);
    return renderOp(opId, params, opsData, profile, file);
  });

  if (/\{\{#ref|\{\{@doc|\{\{@/.test(out) && depth < 8) {
    return expandRefs(out, opsData, profile, file, depth + 1, refMap, partials);
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
