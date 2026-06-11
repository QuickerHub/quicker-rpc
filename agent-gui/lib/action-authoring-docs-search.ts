import MiniSearch from "minisearch";
import {
  parseIndexableSections,
  tryExtractSectionBody,
  type MarkdownSection,
} from "@/lib/guide-markdown-section-parser";

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
  /** Matched section heading when hit came from a fragment row. */
  sectionHeading?: string;
};

const TOKEN_SPLIT = /[\s\-_:./|#*()[\]{}`'"，。；、！？]+/;
const SYS_MODULE_KEY_RE = /^sys:([a-z0-9_]+)$/i;
const SEARCH_BOOST = {
  topic: 4,
  reference: 3,
  aliases: 4,
  title: 2,
  description: 2,
  section: 3,
  markdown: 1,
} as const;

const TOPIC_INDEX_MAX_CHARS = 2000;
const SECTION_INDEX_MAX_CHARS = 1200;
const SECTION_PREVIEW_CHARS = 220;
const SEARCH_SNIPPET_MAX_CHARS = 1200;
const SEARCH_EXCERPT_MAX_CHARS = 320;

/** Compact plain text for token index fields (topic overview row). */
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
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const body = plain.slice(0, maxChars);
  return headings ? `${headings} ${body}`.trim() : body;
}

function compactSectionBody(body: string, maxChars = SECTION_INDEX_MAX_CHARS): string {
  const plain = body
    .replace(/^#+\s+/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length <= maxChars ? plain : plain.slice(0, maxChars);
}

function buildTopicIndexBody(markdown: string): string {
  const sections = parseIndexableSections(markdown);
  const sectionIndex = sections
    .map((s) => `${s.heading} ${compactSectionBody(s.body, SECTION_PREVIEW_CHARS)}`)
    .join(" ");
  const intro = compactMarkdownForSearch(markdown, 500);
  const combined = sectionIndex ? `${intro} ${sectionIndex}`.trim() : intro;
  return combined.length <= TOPIC_INDEX_MAX_CHARS
    ? combined
    : combined.slice(0, TOPIC_INDEX_MAX_CHARS);
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

function uniqueFragmentId(
  parentId: string,
  section: MarkdownSection,
  index: number,
  used: Set<string>,
): string {
  let slug = section.slug || `section-${index}`;
  let candidate = `${parentId}#${slug}`;
  let n = 2;
  while (used.has(candidate)) {
    slug = `${section.slug || "section"}-${n++}`;
    candidate = `${parentId}#${slug}`;
  }
  used.add(candidate);
  return candidate;
}

export type AuthoringDocsSearchIndex = {
  index: MiniSearch;
  rowById: Map<string, AuthoringDocSearchRow>;
  /** fragment document id → matched section heading */
  sectionByFragmentId: Map<string, string>;
  /** fragment document id → parent row id */
  fragmentParentId: Map<string, string>;
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

      if (ref?.startsWith("kc/")) {
        const baseRef = ref.slice("kc/".length);
        const hasAuthoredSibling = hits.some(
          (h) =>
            h.row.topic === row.topic
            && h.row.reference?.toLowerCase() === baseRef,
        );
        if (hasAuthoredSibling) bonus -= 100;
      } else if (hit.sectionHeading) {
        bonus += 15;
      }

      return bonus === 0 ? hit : { ...hit, score: hit.score + bonus };
    })
    .sort((a, b) => b.score - a.score);
}

export function buildAuthoringDocsSearchIndex(
  rows: AuthoringDocSearchRow[],
): AuthoringDocsSearchIndex {
  const rowById = new Map<string, AuthoringDocSearchRow>();
  const sectionByFragmentId = new Map<string, string>();
  const fragmentParentId = new Map<string, string>();

  /** @type {Record<string, unknown>[]} */
  const documents = [];

  for (const row of rows) {
    const parentId = authoringDocRowId(row);
    rowById.set(parentId, row);

    documents.push({
      id: parentId,
      topic: row.topic,
      reference: row.reference ?? "",
      aliases: row.searchAliases ?? "",
      title: row.title,
      description: row.description,
      section: "",
      markdown: buildTopicIndexBody(row.markdown),
    });

    const usedFragmentIds = new Set<string>();
    for (const [index, section] of parseIndexableSections(row.markdown).entries()) {
      const fragId = uniqueFragmentId(parentId, section, index, usedFragmentIds);
      sectionByFragmentId.set(fragId, section.heading);
      fragmentParentId.set(fragId, parentId);
      documents.push({
        id: fragId,
        topic: row.topic,
        reference: row.reference ?? "",
        aliases: row.searchAliases ?? "",
        title: row.title,
        description: row.description,
        section: section.heading,
        markdown: compactSectionBody(section.body),
      });
    }
  }

  const index = new MiniSearch({
    fields: ["topic", "reference", "aliases", "title", "description", "section", "markdown"],
    storeFields: ["id"],
    tokenize: tokenizeAuthoringDocText,
    searchOptions: {
      boost: { ...SEARCH_BOOST },
      fuzzy: 0.2,
      prefix: true,
    },
  });

  index.addAll(documents);
  return { index, rowById, sectionByFragmentId, fragmentParentId };
}

function selectBestHitPerDocument(
  hits: AuthoringDocSearchHit[],
  cap: number,
): AuthoringDocSearchHit[] {
  const best = new Map<string, AuthoringDocSearchHit>();
  for (const hit of hits) {
    const key = authoringDocRowId(hit.row);
    const existing = best.get(key);
    if (!existing || hit.score > existing.score) {
      best.set(key, hit);
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);
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

  const searchLimit = Math.min(50, Math.max(cap * 4, cap));
  const results = bundle.index.search(query, {
    boost: { ...SEARCH_BOOST },
    fuzzy: query.length >= 4 ? 0.2 : 0,
    prefix: true,
  });

  const hits = results
    .map((hit): AuthoringDocSearchHit | null => {
      const hitId = String(hit.id);
      const parentId = bundle.fragmentParentId.get(hitId) ?? hitId;
      const row = bundle.rowById.get(parentId);
      if (!row) return null;
      const sectionHeading = bundle.sectionByFragmentId.get(hitId);
      return sectionHeading
        ? { row, score: hit.score, sectionHeading }
        : { row, score: hit.score };
    })
    .filter((hit): hit is AuthoringDocSearchHit => hit !== null);

  return selectBestHitPerDocument(
    rerankAuthoringDocSearchHits(query, hits),
    searchLimit,
  ).slice(0, cap);
}

export function splitSearchPatterns(keyword: string): string[] {
  return keyword
    .split(/\s+/)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);
}

function preferMatchingSectionExcerpt(
  markdown: string,
  patterns: string[],
): string | null {
  if (patterns.length === 0) return null;

  let best: MarkdownSection | null = null;
  let bestScore = 0;
  for (const section of parseIndexableSections(markdown)) {
    const haystack = `${section.heading} ${section.body}`.toLowerCase();
    let score = 0;
    for (const pattern of patterns) {
      if (haystack.includes(pattern)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = section;
    }
  }

  if (!best || bestScore === 0) return null;

  const plain = best.body
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`#[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${best.heading}. ${plain}`;
}

function resolveSnippetSource(
  markdown: string,
  patterns: string[],
  sectionHeading?: string,
): string {
  if (sectionHeading) {
    const body = tryExtractSectionBody(markdown, sectionHeading);
    if (body) {
      return `## ${sectionHeading}\n\n${body}`.trim();
    }
  }

  if (patterns.length > 0) {
    let best: MarkdownSection | null = null;
    let bestScore = 0;
    for (const section of parseIndexableSections(markdown)) {
      const haystack = `${section.heading} ${section.body}`.toLowerCase();
      let score = 0;
      for (const pattern of patterns) {
        if (haystack.includes(pattern)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = section;
      }
    }
    if (best && bestScore > 0) {
      return `## ${best.heading}\n\n${best.body}`.trim();
    }
  }

  const intro = parseIndexableSections(markdown)[0];
  if (intro) {
    return `## ${intro.heading}\n\n${intro.body}`.trim();
  }
  return markdown.trim();
}

function trimSnippetAroundPatterns(
  text: string,
  patterns: string[],
  maxLength: number,
): string {
  let plain = text.replace(/<!--[\s\S]*?-->/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (plain.length <= maxLength) {
    return plain;
  }

  if (patterns.length > 0) {
    const lower = plain.toLowerCase();
    let idx = -1;
    for (const p of patterns) {
      const found = lower.indexOf(p);
      if (found >= 0 && (idx < 0 || found < idx)) {
        idx = found;
      }
    }
    if (idx >= 0) {
      const half = Math.floor(maxLength / 2);
      const start = Math.max(0, idx - half);
      const slice = plain.slice(start, start + maxLength);
      const prefix = start > 0 ? "…" : "";
      const suffix = start + maxLength < plain.length ? "…" : "";
      return `${prefix}${slice.trim()}${suffix}`;
    }
  }

  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

/** Section-focused chunk for agent consumption (not the full document). */
export function buildSearchSnippet(
  markdown: string,
  patterns: string[],
  sectionHeading?: string,
  maxLength = SEARCH_SNIPPET_MAX_CHARS,
): string {
  const source = resolveSnippetSource(markdown, patterns, sectionHeading);
  return trimSnippetAroundPatterns(source, patterns, maxLength);
}

/** Build excerpt centered on the first query-token hit (section-aware). */
export function buildSearchExcerpt(
  markdown: string,
  patterns: string[],
  maxLength = SEARCH_EXCERPT_MAX_CHARS,
  sectionHeading?: string,
): string {
  const sectionBody = sectionHeading
    ? tryExtractSectionBody(markdown, sectionHeading)
    : null;

  let plain = sectionBody ?? markdown;
  plain = plain.replace(/^#+\s*/gm, "");
  plain = plain.replace(/<!--[\s\S]*?-->/g, "");
  plain = plain.replace(/[*_`#[\]()]/g, "");
  plain = plain.replace(/\s+/g, " ").trim();

  if (sectionHeading) {
    plain = `${sectionHeading}. ${plain}`;
  } else if (patterns.length > 0) {
    plain = preferMatchingSectionExcerpt(markdown, patterns) ?? plain;
  }

  if (patterns.length > 0) {
    const lower = plain.toLowerCase();
    let idx = -1;
    for (const p of patterns) {
      const found = lower.indexOf(p);
      if (found >= 0 && (idx < 0 || found < idx)) {
        idx = found;
      }
    }
    if (idx >= 0) {
      const before = 80;
      const start = Math.max(0, idx - before);
      const slice = plain.slice(start);
      plain = start > 0 ? `…${slice}` : slice;
    }
  }

  if (plain.length <= maxLength) {
    return plain;
  }
  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

export { joinSearchAliases };
