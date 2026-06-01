import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveRepoRoot } from "@/lib/repo-root";

const DOCS_DIR = "docs/action-authoring/agent";

export type ActionAuthoringTopicMeta = {
  topic: string;
  title: string;
  charCount: number;
};

export type ActionAuthoringDoc = {
  topic: string;
  title: string;
  markdown: string;
};

export type ActionAuthoringSearchItem = {
  topic: string;
  title: string;
  excerpt: string;
};

type TopicRow = ActionAuthoringTopicMeta & { markdown: string };

function docsRoot(): string {
  return join(resolveRepoRoot(), DOCS_DIR);
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

async function loadAllTopics(): Promise<TopicRow[]> {
  const root = docsRoot();
  const names = (await readdir(root))
    .filter((n) => n.endsWith(".md") && n.toLowerCase() !== "readme.md")
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  const rows: TopicRow[] = [];
  for (const name of names) {
    const markdown = await readFile(join(root, name), "utf8");
    const topic = name.replace(/\.md$/i, "");
    rows.push({
      topic,
      title: extractTitle(markdown) || topic,
      charCount: markdown.length,
      markdown,
    });
  }
  return rows;
}

export async function listActionAuthoringTopics(): Promise<
  ActionAuthoringTopicMeta[]
> {
  const rows = await loadAllTopics();
  return rows.map(({ topic, title, charCount }) => ({
    topic,
    title,
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
  const bodyLower = row.markdown.toLowerCase();
  for (const p of patterns) {
    if (topicLower.includes(p)) score += 8;
    if (titleLower.includes(p)) score += 4;
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
      const hay = `${row.topic} ${row.title} ${row.markdown}`.toLowerCase();
      return patterns.every((p) => hay.includes(p));
    });
  }

  const scored = candidates
    .map((row) => ({ row, score: patterns.length ? rowScore(row, patterns) : 0 }))
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
    excerpt: buildExcerpt(row.markdown, patterns),
  }));

  return {
    keyword: keyword?.trim() ? keyword.trim() : null,
    matchCount: items.length,
    items,
    availableTopics,
  };
}
