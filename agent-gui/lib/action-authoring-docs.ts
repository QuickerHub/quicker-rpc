import "server-only";

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  type ActionAuthoringDoc,
  type ActionAuthoringReferenceMeta,
  type ActionAuthoringSearchItem,
  type ActionAuthoringTopicMeta,
  groupTopicsByLayer,
  sortTopicsByLayer,
} from "@/lib/action-authoring-docs.shared";
import {
  compactSkillBody,
  formatAllPreloadedSkillsForPrompt,
  loadSkillInstructions,
  loadTopicsManifest,
  parseSkillMd,
  resolveSkillDir,
} from "@/lib/agent-skills";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { invokeQkrpcHttp } from "@/lib/qkrpc-http";
import {
  buildAuthoringDocsSearchIndex,
  buildSearchExcerpt,
  joinSearchAliases,
  searchAuthoringDocRows,
  splitSearchPatterns,
  type AuthoringDocsSearchIndex,
} from "@/lib/action-authoring-docs-search";
import { resolveQuickerRpcRepoRoot } from "@/lib/repo-root";

export type {
  ActionAuthoringDoc,
  ActionAuthoringReferenceMeta,
  ActionAuthoringSearchItem,
  ActionAuthoringTopicMeta,
} from "@/lib/action-authoring-docs.shared";
export {
  docViewerEntryKey,
  groupTopicsByLayer,
  sortTopicsByLayer,
  ACTION_AUTHORING_LAYER_ORDER,
  ACTION_AUTHORING_LAYER_LABELS,
} from "@/lib/action-authoring-docs.shared";
export type { ActionAuthoringLayerGroup } from "@/lib/action-authoring-docs.shared";

const AUTHORING_SKILL = "quicker-authoring";
const LEGACY_DOCS_DIR = "docs/action-authoring/agent";

type TopicRow = ActionAuthoringTopicMeta & {
  markdown: string;
  reference?: string;
  searchAliases?: string;
};

type TopicsManifestEntry = {
  topic: string;
  title?: string;
  description: string;
  layer?: string;
  allowedTools?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  source?: string;
  searchAliases?: string[];
};

type ReferenceCatalogEntry = {
  id: string;
  title: string;
  path: string;
  searchAliases?: string[];
};

type TopicsManifest = {
  skillName: string;
  topics: TopicsManifestEntry[];
  referenceFiles: Record<string, string>;
  referenceCatalog?: Record<string, ReferenceCatalogEntry[]>;
};

let cachedRows: TopicRow[] | null = null;
let cachedSearchIndex: AuthoringDocsSearchIndex | null = null;
let cachedRoot: string | null = null;
let cachedSkillsMtimeMs = 0;
let cachedPromptBlock: { content: string; mtimeMs: number } | null = null;

/** @deprecated Use compactSkillBody from agent-skills */
function compactMarkdownBody(markdown: string): string {
  return compactSkillBody(markdown);
}

async function skillsTreeMtimeMs(root: string): Promise<number> {
  let max = 0;
  const candidates = [
    join(root, "SKILL.md"),
    join(root, "topics.json"),
    join(root, "prompt-tier0.md"),
  ];
  for (const filePath of candidates) {
    try {
      max = Math.max(max, (await stat(filePath)).mtimeMs);
    } catch {
      // ignore
    }
  }

  const refDir = join(root, "references");
  max = Math.max(max, await referencesTreeMtimeMs(refDir));

  // Legacy per-topic skill dirs
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return max;
  }
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name === "references") continue;
    const skillPath = join(root, ent.name, "SKILL.md");
    try {
      max = Math.max(max, (await stat(skillPath)).mtimeMs);
    } catch {
      // ignore
    }
  }

  return max;
}

function skillsRoot(): string {
  return resolveSkillDir(AUTHORING_SKILL);
}

function legacyDocsRoot(): string {
  const repo = resolveQuickerRpcRepoRoot();
  if (repo) return join(repo, LEGACY_DOCS_DIR);
  return join(resolveAgentGuiRoot(), LEGACY_DOCS_DIR);
}

const TOPIC_ALIASES: Record<string, string> = {
  expression: "expressions",
};

/** Topics whose guide.get response includes embedded JSON schema (repo file is source of truth). */
const SCHEMA_TOPIC_FILES: Record<string, string> = {
  "action-data-schema": "docs/action-authoring-src/schemas/action-data-schema.json",
  "form-spec": "docs/action-authoring-src/schemas/form-spec-schema.json",
};

function readSchemaFromGuidePayload(parsed: unknown): Record<string, unknown> | null {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const schema = (parsed as { schema?: unknown }).schema;
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return null;
  }
  return schema as Record<string, unknown>;
}

async function loadTopicSchema(topic: string): Promise<Record<string, unknown> | null> {
  const key = normalizeTopic(topic);
  const rel = SCHEMA_TOPIC_FILES[key];
  if (!rel) return null;

  const repo = resolveQuickerRpcRepoRoot();
  if (repo) {
    try {
      const raw = await readFile(join(repo, rel), "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // fall through to serve
    }
  }

  const http = await invokeQkrpcHttp(
    { op: "guide.get", args: { topic: key } },
    { timeoutMs: 15_000 },
  );
  if (!http?.ok) return null;
  return readSchemaFromGuidePayload(http.parsed);
}

function normalizeTopic(topic: string): string {
  const key = topic.trim().replace(/\/+$/, "").toLowerCase();
  return TOPIC_ALIASES[key] ?? key;
}

async function referencesTreeMtimeMs(dir: string): Promise<number> {
  let max = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      max = Math.max(max, await referencesTreeMtimeMs(full));
      continue;
    }
    if (!ent.name.endsWith(".md")) continue;
    max = Math.max(max, (await stat(full)).mtimeMs);
  }
  return max;
}

function referencesForTopic(
  manifest: TopicsManifest | null,
  topic: string,
): ActionAuthoringReferenceMeta[] {
  const list = manifest?.referenceCatalog?.[topic];
  if (!list?.length) return [];
  return list.map((e) => ({
    id: e.id,
    title: e.title,
    searchAliases: e.searchAliases,
  }));
}

function resolveReferenceMarkdownPath(
  root: string,
  topic: string,
  refKey: string,
  manifest: TopicsManifest | null,
  manifestFileName?: string,
): string {
  const catalog = manifest?.referenceCatalog?.[topic];
  const entry = catalog?.find((e) => e.id.toLowerCase() === refKey);
  if (entry?.path) {
    return join(root, "references", entry.path);
  }
  const nested = join(root, "references", topic, `${manifestFileName ?? refKey}.md`);
  return nested;
}

function extractTitle(markdown: string): string {
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      return trimmed.slice(2).trim();
    }
  }
  return "";
}

async function readTopicMarkdown(
  root: string,
  topic: string,
): Promise<string | null> {
  if (topic === "overview") {
    try {
      const content = await readFile(
        join(root, "references", "overview.md"),
        "utf8",
      );
      return compactMarkdownBody(content);
    } catch {
      return null;
    }
  }

  try {
    const content = await readFile(
      join(root, "references", `${topic}.md`),
      "utf8",
    );
    return compactMarkdownBody(content);
  } catch {
    return null;
  }
}

async function loadUnifiedSkillTopics(root: string): Promise<TopicRow[]> {
  const manifest = (await loadTopicsManifest(root)) as TopicsManifest | null;
  if (!manifest?.topics?.length) return [];

  const rows: TopicRow[] = [];
  for (const meta of manifest.topics) {
    const markdown = await readTopicMarkdown(root, meta.topic);
    if (markdown == null) continue;
    rows.push({
      topic: meta.topic,
      title:
        meta.title?.trim() || extractTitle(markdown) || meta.topic,
      description: meta.description,
      layer: meta.layer?.trim() || meta.metadata?.layer,
      charCount: markdown.length,
      references: referencesForTopic(manifest, meta.topic),
      markdown,
      searchAliases: joinSearchAliases(meta.searchAliases),
    });

    for (const ref of referencesForTopic(manifest, meta.topic)) {
      const refPath = resolveReferenceMarkdownPath(
        root,
        meta.topic,
        ref.id.toLowerCase(),
        manifest,
        ref.id,
      );
      let refMarkdown: string;
      try {
        refMarkdown = compactMarkdownBody(await readFile(refPath, "utf8"));
      } catch {
        continue;
      }
      rows.push({
        topic: meta.topic,
        reference: ref.id,
        title: extractTitle(refMarkdown) || ref.title,
        description: ref.title,
        charCount: refMarkdown.length,
        references: referencesForTopic(manifest, meta.topic),
        markdown: refMarkdown,
        searchAliases: joinSearchAliases(ref.searchAliases),
      });
    }
  }
  return rows;
}

async function loadLegacyPerTopicSkills(root: string): Promise<TopicRow[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs = entries
    .filter((e) => e.isDirectory() && e.name !== "references")
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const rows: TopicRow[] = [];
  for (const topic of dirs) {
    const skillPath = join(root, topic, "SKILL.md");
    let content: string;
    try {
      content = await readFile(skillPath, "utf8");
    } catch {
      continue;
    }

    const parsed = parseSkillMd(content);
    const markdown = compactMarkdownBody(parsed.body);
    rows.push({
      topic: parsed.name || topic,
      title: extractTitle(markdown) || parsed.name || topic,
      description: parsed.description,
      charCount: markdown.length,
      markdown,
    });
  }
  return rows;
}

async function loadLegacyFlatTopics(root: string): Promise<TopicRow[]> {
  let names: string[];
  try {
    names = (await readdir(root))
      .filter((n) => n.endsWith(".md") && n.toLowerCase() !== "readme.md")
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  } catch {
    return [];
  }

  const rows: TopicRow[] = [];
  for (const name of names) {
    const markdown = await readFile(join(root, name), "utf8");
    const topic = name.replace(/\.md$/i, "");
    rows.push({
      topic,
      title: extractTitle(markdown) || topic,
      description: "",
      charCount: markdown.length,
      markdown,
    });
  }
  return rows;
}

async function loadAllTopics(): Promise<TopicRow[]> {
  const root = skillsRoot();
  const skillsMtime = await skillsTreeMtimeMs(root);
  if (
    cachedRows
    && cachedRoot === root
    && cachedSkillsMtimeMs === skillsMtime
  ) {
    return cachedRows;
  }

  let rows = await loadUnifiedSkillTopics(root);
  if (rows.length === 0) {
    rows = await loadLegacyPerTopicSkills(root);
  }
  if (rows.length === 0) {
    rows = await loadLegacyFlatTopics(legacyDocsRoot());
  }

  cachedRows = rows;
  cachedSearchIndex = buildAuthoringDocsSearchIndex(rows);
  cachedRoot = root;
  cachedSkillsMtimeMs = skillsMtime;
  return rows;
}

async function loadAuthoringDocsSearchIndex(): Promise<AuthoringDocsSearchIndex> {
  const rows = await loadAllTopics();
  if (cachedSearchIndex) {
    return cachedSearchIndex;
  }
  cachedSearchIndex = buildAuthoringDocsSearchIndex(rows);
  return cachedSearchIndex;
}

export async function formatAuthoringSkillRouterForPrompt(): Promise<string> {
  const root = skillsRoot();
  const loaded = await loadSkillInstructions(AUTHORING_SKILL);
  if (!loaded?.body) return "";

  let mtimeMs = 0;
  try {
    mtimeMs = (await stat(loaded.skillMdPath)).mtimeMs;
    const tier0 = join(root, "prompt-tier0.md");
    try {
      mtimeMs = Math.max(mtimeMs, (await stat(tier0)).mtimeMs);
    } catch {
      // optional tier-2 override
    }
  } catch {
    return "";
  }

  if (
    cachedPromptBlock
    && cachedPromptBlock.mtimeMs === mtimeMs
    && cachedRoot === root
  ) {
    return cachedPromptBlock.content;
  }

  const content = await formatAllPreloadedSkillsForPrompt({
    [AUTHORING_SKILL]: {
      suffix:
        'Stuck → docs({ action: "get", topic }). No session-start multi-get.',
    },
  });
  cachedPromptBlock = { content, mtimeMs };
  cachedRoot = root;
  return content;
}

/** English layer headings for system-prompt topic index (UI catalog keeps Chinese labels). */
const PROMPT_LAYER_LABELS: Record<string, string> = {
  router: "Router",
  workflow: "Workflow",
  schema: "Schema",
  catalog: "Modules",
  adjunct: "Adjunct",
  "cli-only": "CLI",
  other: "Other",
};

export async function formatAuthoringTopicIndexForPrompt(): Promise<string> {
  const topics = await listActionAuthoringTopics();
  if (topics.length === 0) return "";

  const groups = groupTopicsByLayer(topics);
  const lines = ["### Topic index (docs get when skill active)"];
  for (const group of groups) {
    if (group.topics.length === 0) continue;
    const label = PROMPT_LAYER_LABELS[group.layer] ?? group.layer;
    lines.push("", `#### ${label}`);
    for (const t of group.topics) {
      const desc = t.description.trim() || t.title;
      lines.push(`- ${t.topic}: ${desc}`);
      for (const ref of t.references ?? []) {
        lines.push(`  - ${t.topic}/${ref.id}`);
      }
    }
  }
  return lines.join("\n");
}

/** Tier 2 preloaded skill + topic index for system prompt injection. */
export async function formatAuthoringSkillForPrompt(): Promise<string> {
  const router = await formatAuthoringSkillRouterForPrompt();
  const index = await formatAuthoringTopicIndexForPrompt();
  const parts = [router, index].filter(Boolean);
  return parts.join("\n\n");
}

/** @deprecated Prefer formatAuthoringSkillForPrompt */
export async function formatSkillCatalogForPrompt(): Promise<string> {
  return formatAuthoringSkillForPrompt();
}

export async function listActionAuthoringReferences(
  topic: string,
): Promise<string[]> {
  const key = normalizeTopic(topic);
  const root = skillsRoot();
  const manifest = await loadTopicsManifest(root);
  const catalog = manifest?.referenceCatalog?.[
    manifest.topics.find((t) => t.topic.toLowerCase() === key)?.topic ?? key
  ];
  if (catalog?.length) {
    return catalog.map((e) => e.id).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }

  if (manifest?.referenceFiles) {
    return Object.entries(manifest.referenceFiles)
      .filter(([, owner]) => owner.toLowerCase() === key)
      .map(([file]) => file)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  const refDir = join(root, "references", key);
  try {
    return (await readdir(refDir))
      .filter((n) => n.endsWith(".md") && n.toLowerCase() !== "readme.md")
      .map((n) => n.replace(/\.md$/i, ""))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  } catch {
    return [];
  }
}

export async function getActionAuthoringReference(
  topic: string,
  file: string,
): Promise<
  | { ok: true; doc: ActionAuthoringDoc & { reference: string } }
  | {
      ok: false;
      error: string;
      availableTopics: string[];
      availableReferences?: string[];
    }
> {
  const key = normalizeTopic(topic);
  const refKey = file
    .trim()
    .replace(/\\/g, "/")
    .replace(/^references\//, "")
    .replace(/\.md$/i, "")
    .toLowerCase();

  const rows = await loadAllTopics();
  const availableTopics = [
    ...new Set(rows.map((r) => r.topic)),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  if (!key) {
    return { ok: false, error: "topic is required", availableTopics };
  }
  if (!refKey) {
    return { ok: false, error: "file is required", availableTopics };
  }

  if (refKey.includes("/") || refKey.includes("..")) {
    return {
      ok: false,
      error: `Invalid reference file: ${file}`,
      availableTopics,
    };
  }

  const match = rows.find(
    (r) => r.topic.toLowerCase() === key && !r.reference,
  );
  if (!match) {
    return {
      ok: false,
      error: `Unknown topic: ${key}`,
      availableTopics,
    };
  }

  const refRow = rows.find(
    (r) =>
      r.topic.toLowerCase() === key
      && r.reference?.toLowerCase() === refKey,
  );
  if (refRow) {
    return {
      ok: true,
      doc: {
        topic: refRow.topic,
        title: refRow.title,
        description: refRow.description,
        markdown: refRow.markdown,
        reference: refRow.reference!,
      },
    };
  }

  const root = skillsRoot();
  const manifest = await loadTopicsManifest(root);
  let refFileName = refKey;
  if (manifest?.referenceFiles) {
    const ownerEntry = Object.entries(manifest.referenceFiles).find(
      ([name]) => name.toLowerCase() === refKey,
    );
    const owner = ownerEntry?.[1];
    if (!owner || owner.toLowerCase() !== key) {
      const availableReferences = await listActionAuthoringReferences(match.topic);
      return {
        ok: false,
        error: `Unknown reference: ${refKey} (topic: ${match.topic})`,
        availableTopics,
        availableReferences,
      };
    }
    refFileName = ownerEntry[0];
  }

  const catalogEntry = manifest?.referenceCatalog?.[match.topic]?.find(
    (e) => e.id.toLowerCase() === refKey,
  );
  const refPath = catalogEntry?.path
    ? join(root, "references", catalogEntry.path)
    : join(
        root,
        "references",
        topic,
        `${refFileName}.md`,
      );

  let markdown: string;
  try {
    markdown = compactMarkdownBody(await readFile(refPath, "utf8"));
  } catch {
    const legacyFlat = join(root, "references", `${refFileName}.md`);
    try {
      markdown = compactMarkdownBody(await readFile(legacyFlat, "utf8"));
    } catch {
      const availableReferences = await listActionAuthoringReferences(
        match.topic,
      );
      return {
        ok: false,
        error: `Unknown reference: ${refKey} (topic: ${match.topic})`,
        availableTopics,
        availableReferences,
      };
    }
  }

  const catalogTitle = catalogEntry?.title;
  return {
    ok: true,
    doc: {
      topic: match.topic,
      title: extractTitle(markdown) || catalogTitle || `${match.title} · ${refKey}`,
      description: match.description,
      markdown,
      reference: catalogEntry?.id ?? refFileName,
    },
  };
}

export async function listActionAuthoringTopics(): Promise<
  ActionAuthoringTopicMeta[]
> {
  const rows = await loadAllTopics();
  const topics = rows
    .filter((r) => !r.reference)
    .map(({ topic, title, description, layer, charCount, references }) => ({
      topic,
      title,
      description,
      layer,
      charCount,
      references,
    }));
  return sortTopicsByLayer(topics);
}

export async function getActionAuthoringDoc(
  topic: string,
): Promise<
  | { ok: true; doc: ActionAuthoringDoc }
  | { ok: false; error: string; availableTopics: string[] }
> {
  const key = normalizeTopic(topic);
  const rows = await loadAllTopics();
  const availableTopics = [
    ...new Set(rows.map((r) => r.topic)),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  if (!key) {
    return { ok: false, error: "topic is required", availableTopics };
  }

  const match = rows.find(
    (r) => r.topic.toLowerCase() === key && !r.reference,
  );
  if (!match) {
    return {
      ok: false,
      error: `Unknown topic: ${key}`,
      availableTopics,
    };
  }

  const schema = await loadTopicSchema(match.topic);
  return {
    ok: true,
    doc: {
      topic: match.topic,
      title: match.title,
      description: match.description,
      markdown: match.markdown,
      ...(schema ? { schema } : {}),
    },
  };
}

export async function searchActionAuthoringDocs(
  keyword: string | undefined,
  limit = 10,
): Promise<{
  keyword: string | null;
  matchCount: number;
  items: ActionAuthoringSearchItem[];
  availableTopics: string[];
}> {
  const cap = Math.min(Math.max(limit, 1), 50);
  const patterns = splitSearchPatterns(keyword ?? "");
  const rows = await loadAllTopics();
  const searchIndex = await loadAuthoringDocsSearchIndex();
  const availableTopics = [
    ...new Set(rows.map((r) => r.topic)),
  ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const hits = searchAuthoringDocRows(searchIndex, keyword, cap);

  const items = hits.map(({ row, score, sectionHeading }) => ({
    topic: row.topic,
    title: row.reference ? `${row.title} (${row.topic}/${row.reference})` : row.title,
    description: row.description,
    excerpt: buildSearchExcerpt(row.markdown, patterns, 420, sectionHeading),
    reference: row.reference,
    ...(sectionHeading ? { section: sectionHeading } : {}),
    ...(patterns.length > 0 ? { score } : {}),
  }));

  return {
    keyword: keyword?.trim() ? keyword.trim() : null,
    matchCount: items.length,
    items,
    availableTopics,
  };
}
