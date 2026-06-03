import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import { resolveQuickerRpcRepoRoot } from "@/lib/repo-root";
import { parseSkillMd } from "@/lib/skill-parse";

const SKILLS_DIR = "docs/skills/quicker-authoring";
const LEGACY_DOCS_DIR = "docs/action-authoring/agent";

export type ActionAuthoringTopicMeta = {
  topic: string;
  title: string;
  description: string;
  charCount: number;
};

export type ActionAuthoringDoc = {
  topic: string;
  title: string;
  description: string;
  markdown: string;
};

export type ActionAuthoringSearchItem = {
  topic: string;
  title: string;
  description: string;
  excerpt: string;
};

type TopicRow = ActionAuthoringTopicMeta & { markdown: string };

let cachedRows: TopicRow[] | null = null;
let cachedRoot: string | null = null;
let cachedSkillsMtimeMs = 0;

/** Collapse runs of blank lines (keeps single blank lines for GFM block boundaries). */
function compactMarkdownBody(markdown: string): string {
  return markdown.replace(/\n{3,}/g, "\n\n").trimEnd();
}

async function skillsTreeMtimeMs(root: string): Promise<number> {
  let max = 0;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const ent of entries) {
    const full = join(root, ent.name);
    if (ent.isDirectory()) {
      max = Math.max(max, await skillsTreeMtimeMs(full));
      const skillPath = join(full, "SKILL.md");
      try {
        max = Math.max(max, (await stat(skillPath)).mtimeMs);
      } catch {
        // ignore
      }
      const refDir = join(full, "references");
      try {
        for (const ref of await readdir(refDir)) {
          if (!ref.endsWith(".md")) continue;
          max = Math.max(max, (await stat(join(refDir, ref))).mtimeMs);
        }
      } catch {
        // ignore
      }
      continue;
    }
    if (ent.isFile()) {
      max = Math.max(max, (await stat(full)).mtimeMs);
    }
  }
  return max;
}

function skillsRoot(): string {
  const repo = resolveQuickerRpcRepoRoot();
  if (repo) return join(repo, SKILLS_DIR);
  return join(resolveAgentGuiRoot(), SKILLS_DIR);
}

function legacyDocsRoot(): string {
  const repo = resolveQuickerRpcRepoRoot();
  if (repo) return join(repo, LEGACY_DOCS_DIR);
  return join(resolveAgentGuiRoot(), LEGACY_DOCS_DIR);
}

function normalizeTopic(topic: string): string {
  return topic.trim().replace(/\/+$/, "").toLowerCase();
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

async function loadSkillTopics(root: string): Promise<TopicRow[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const dirs = entries
    .filter((e) => e.isDirectory())
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

  let rows = await loadSkillTopics(root);
  if (rows.length === 0) {
    rows = await loadLegacyFlatTopics(legacyDocsRoot());
  }

  cachedRows = rows;
  cachedRoot = root;
  cachedSkillsMtimeMs = skillsMtime;
  return rows;
}

export async function formatSkillCatalogForPrompt(): Promise<string> {
  const topics = await listActionAuthoringTopics();
  if (topics.length === 0) return "";

  const lines = [
    "Authoring skills catalog (Discovery — use docs_get / docs_get_reference for full instructions):",
  ];
  for (const t of topics) {
    const desc = t.description.trim() || t.title;
    lines.push(`- ${t.topic}: ${desc}`);
  }
  return lines.join("\n");
}

export async function listActionAuthoringReferences(
  topic: string,
): Promise<string[]> {
  const key = normalizeTopic(topic);
  const root = skillsRoot();
  const refDir = join(root, key, "references");
  try {
    return (await readdir(refDir))
      .filter((n) => n.endsWith(".md"))
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
  const availableTopics = rows.map((r) => r.topic);

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

  const match = rows.find((r) => r.topic.toLowerCase() === key);
  if (!match) {
    return {
      ok: false,
      error: `Unknown topic: ${key}`,
      availableTopics,
    };
  }

  const refPath = join(skillsRoot(), match.topic, "references", `${refKey}.md`);
  let markdown: string;
  try {
    markdown = await readFile(refPath, "utf8");
  } catch {
    const availableReferences = await listActionAuthoringReferences(match.topic);
    return {
      ok: false,
      error: `Unknown reference: ${refKey} (topic: ${match.topic})`,
      availableTopics,
      availableReferences,
    };
  }

  return {
    ok: true,
    doc: {
      topic: match.topic,
      title: extractTitle(markdown) || `${match.title} · ${refKey}`,
      description: match.description,
      markdown,
      reference: refKey,
    },
  };
}

export async function listActionAuthoringTopics(): Promise<
  ActionAuthoringTopicMeta[]
> {
  const rows = await loadAllTopics();
  return rows.map(({ topic, title, description, charCount }) => ({
    topic,
    title,
    description,
    charCount,
  }));
}

export async function getActionAuthoringDoc(
  topic: string,
): Promise<
  | { ok: true; doc: ActionAuthoringDoc }
  | { ok: false; error: string; availableTopics: string[] }
> {
  const key = normalizeTopic(topic);
  const rows = await loadAllTopics();
  const availableTopics = rows.map((r) => r.topic);

  if (!key) {
    return { ok: false, error: "topic is required", availableTopics };
  }

  const match = rows.find((r) => r.topic.toLowerCase() === key);
  if (!match) {
    return {
      ok: false,
      error: `Unknown topic: ${key}`,
      availableTopics,
    };
  }

  return {
    ok: true,
    doc: {
      topic: match.topic,
      title: match.title,
      description: match.description,
      markdown: match.markdown,
    },
  };
}

function splitPatterns(keyword: string): string[] {
  return keyword
    .split(/\s+/)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);
}

function buildExcerpt(
  markdown: string,
  patterns: string[],
  maxLength = 280,
): string {
  let plain = markdown.replace(/^#+\s*/gm, "");
  plain = plain.replace(/[*_`#[\]()]/g, "");
  plain = plain.replace(/\s+/g, " ").trim();

  if (patterns.length > 0) {
    const lower = plain.toLowerCase();
    let idx = -1;
    for (const p of patterns) {
      const found = lower.indexOf(p);
      if (found >= 0 && (idx < 0 || found < idx)) {
        idx = found;
      }
    }
    if (idx > 40) {
      plain = `…${plain.slice(idx)}`;
    }
  }

  if (plain.length <= maxLength) {
    return plain;
  }
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

function rowScore(row: TopicRow, patterns: string[]): number {
  let score = 0;
  const topicLower = row.topic.toLowerCase();
  const titleLower = row.title.toLowerCase();
  const descLower = row.description.toLowerCase();
  const bodyLower = row.markdown.toLowerCase();
  for (const p of patterns) {
    if (topicLower.includes(p)) score += 8;
    if (titleLower.includes(p)) score += 4;
    if (descLower.includes(p)) score += 4;
    if (bodyLower.includes(p)) score += 1;
  }
  return score;
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
  const patterns = splitPatterns(keyword ?? "");
  const rows = await loadAllTopics();
  const availableTopics = rows.map((r) => r.topic);

  let candidates = rows;
  if (patterns.length > 0) {
    candidates = rows.filter((row) => {
      const hay =
        `${row.topic} ${row.title} ${row.description} ${row.markdown}`.toLowerCase();
      return patterns.every((p) => hay.includes(p));
    });
  }

  const scored = candidates
    .map((row) => ({
      row,
      score: patterns.length ? rowScore(row, patterns) : 0,
    }))
    .sort(
      (a, b) =>
        b.score - a.score
        || a.row.topic.localeCompare(b.row.topic, undefined, {
          sensitivity: "base",
        }),
    )
    .slice(0, cap);

  const items = scored.map(({ row }) => ({
    topic: row.topic,
    title: row.title,
    description: row.description,
    excerpt: buildExcerpt(row.markdown, patterns),
  }));

  return {
    keyword: keyword?.trim() ? keyword.trim() : null,
    matchCount: items.length,
    items,
    availableTopics,
  };
}
