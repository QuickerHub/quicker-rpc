import MiniSearch from "minisearch";

export type AuthoringDocSearchRow = {
  topic: string;
  title: string;
  description: string;
  markdown: string;
  reference?: string;
};

export type AuthoringDocSearchHit = {
  row: AuthoringDocSearchRow;
  score: number;
};

const TOKEN_SPLIT = /[\s\-_:./|#*()[\]{}`'"，。；、！？]+/;

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
      title: row.title,
      description: row.description,
      markdown: row.markdown,
    };
  });

  const index = new MiniSearch({
    fields: ["topic", "reference", "title", "description", "markdown"],
    storeFields: ["id"],
    tokenize: tokenizeAuthoringDocText,
    searchOptions: {
      boost: {
        topic: 4,
        reference: 3,
        title: 2,
        description: 2,
        markdown: 1,
      },
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
    boost: {
      topic: 4,
      reference: 3,
      title: 2,
      description: 2,
      markdown: 1,
    },
    fuzzy: 0.2,
    prefix: true,
  });

  return results
    .map((hit) => {
      const row = bundle.rowById.get(String(hit.id));
      if (!row) return null;
      return { row, score: hit.score };
    })
    .filter((hit): hit is AuthoringDocSearchHit => hit != null)
    .slice(0, cap);
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
