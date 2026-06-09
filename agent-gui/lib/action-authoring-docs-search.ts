import MiniSearch from "minisearch";

export type AuthoringDocSearchRow = {
  topic: string;
  title: string;
  description: string;
  markdown: string;
  reference?: string;
  /** Space-joined search aliases from topics manifest. */
  searchAliases?: string;
};

export type AuthoringDocSearchHit = {
  row: AuthoringDocSearchRow;
  score: number;
};

const TOKEN_SPLIT = /[\s\-_:./|#*()[\]{}`'"，。；、！？]+/;
const SYS_MODULE_KEY_RE = /^sys:([a-z0-9_]+)$/i;
const SEARCH_BOOST = {
  topic: 4,
  reference: 3,
  aliases: 4,
  title: 2,
  description: 2,
  markdown: 1,
} as const;

/** Shrink body text indexed for search to reduce cross-doc noise. */
export function compactMarkdownForSearch(
  markdown: string,
  maxChars = 600,
): string {
  const headings = [...markdown.matchAll(/^#+\s+(.+)$/gm)]
    .map((match) => match[1]?.trim() ?? "")
    .filter((line) => line.length > 0)
    .join(" ");
  const plain = markdown
    .replace(/^#+\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  const body = plain.slice(0, maxChars);
  return headings ? `${headings} ${body}`.trim() : body;
}

/** Tokenizer tuned for mixed English identifiers and Chinese phrases. */
export function tokenizeAuthoringDocText(text: string): string[] {
  const tokens = new Set<string>();
  const lower = text.toLowerCase();

  for (const part of lower.split(TOKEN_SPLIT)) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      tokens.add(trimmed);
    }
  }

  for (const seq of text.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    tokens.add(seq);
    if (seq.length <= 6) {
      for (let i = 0; i < seq.length - 1; i++) {
        tokens.add(seq.slice(i, i + 2));
      }
    }
  }

  return [...tokens];
}

export function authoringDocRowId(row: AuthoringDocSearchRow): string {
  return row.reference ? `${row.topic}/${row.reference}` : row.topic;
}

export type AuthoringDocsSearchIndex = {
  index: MiniSearch;
  rowById: Map<string, AuthoringDocSearchRow>;
};

function joinSearchAliases(aliases?: string[] | string): string {
  if (!aliases) return "";
  if (Array.isArray(aliases)) {
    return aliases.map((a) => a.trim()).filter(Boolean).join(" ");
  }
  return aliases.trim();
}

/** Boost exact sys: module keys and alias/topic-id matches over fuzzy body hits. */
export function rerankAuthoringDocSearchHits(
  query: string,
  hits: AuthoringDocSearchHit[],
): AuthoringDocSearchHit[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return hits;

  const sysMatch = SYS_MODULE_KEY_RE.exec(normalized);
  const moduleKey = sysMatch?.[1]?.toLowerCase();
  const isSysQuery = Boolean(moduleKey);
  const topicIds = new Set(hits.map((h) => h.row.topic));

  return hits
    .map((hit) => {
      let bonus = 0;
      const { row } = hit;
      const topic = row.topic.toLowerCase();
      const ref = row.reference?.toLowerCase();
      const title = row.title.toLowerCase();
      const aliases = row.searchAliases?.toLowerCase() ?? "";

      if (moduleKey) {
        if (ref === moduleKey) bonus += 500;
        if (title === normalized || title === `sys:${moduleKey}`) bonus += 400;
        if (!row.reference && topic.includes(moduleKey) && topic !== "step-modules") {
          bonus -= 350;
        }
      } else if (!row.reference && topic === normalized) {
        bonus += 250;
      }

      if (
        aliases.length > 0
        && aliases.split(/\s+/).some((alias) => alias === normalized)
      ) {
        bonus += 400;
      }

      if (!isSysQuery) {
        if (!row.reference && topic.endsWith("-authoring")) {
          const base = topic.slice(0, -"-authoring".length);
          if (base.startsWith(normalized) || normalized.startsWith(base.slice(0, normalized.length))) {
            bonus += 350;
          }
        }
        if (
          row.reference
          && row.topic === "step-modules"
          && topicIds.has(`${row.reference}-authoring`)
          && (ref === normalized || (ref != null && ref.startsWith(normalized)))
        ) {
          bonus -= 300;
        }
      }

      return bonus === 0 ? hit : { ...hit, score: hit.score + bonus };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildAuthoringDocsSearchIndex(
  rows: AuthoringDocSearchRow[],
): AuthoringDocsSearchIndex {
  const rowById = new Map<string, AuthoringDocSearchRow>();
  const documents = rows.map((row) => {
    const id = authoringDocRowId(row);
    rowById.set(id, row);
    return {
      id,
      topic: row.topic,
      reference: row.reference ?? "",
      aliases: row.searchAliases ?? "",
      title: row.title,
      description: row.description,
      markdown: compactMarkdownForSearch(row.markdown),
    };
  });

  const index = new MiniSearch({
    fields: ["topic", "reference", "aliases", "title", "description", "markdown"],
    storeFields: ["id"],
    tokenize: tokenizeAuthoringDocText,
    searchOptions: {
      boost: { ...SEARCH_BOOST },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  index.addAll(documents);
  return { index, rowById };
}

export function searchAuthoringDocRows(
  bundle: AuthoringDocsSearchIndex,
  keyword: string | undefined,
  limit: number,
): AuthoringDocSearchHit[] {
  const cap = Math.min(Math.max(limit, 1), 50);
  const query = keyword?.trim() ?? "";

  if (!query) {
    return [...bundle.rowById.values()]
      .sort((a, b) =>
        a.topic.localeCompare(b.topic, undefined, { sensitivity: "base" }),
      )
      .slice(0, cap)
      .map((row) => ({ row, score: 0 }));
  }

  const results = bundle.index.search(query, {
    boost: { ...SEARCH_BOOST },
    fuzzy: query.length >= 4 ? 0.2 : 0,
    prefix: true,
  });

  const hits = results
    .map((hit) => {
      const row = bundle.rowById.get(String(hit.id));
      if (!row) return null;
      return { row, score: hit.score };
    })
    .filter((hit): hit is AuthoringDocSearchHit => hit != null);

  return rerankAuthoringDocSearchHits(query, hits).slice(0, cap);
}

export function splitSearchPatterns(keyword: string): string[] {
  return keyword
    .split(/\s+/)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);
}

export function buildSearchExcerpt(
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

export { joinSearchAliases };
