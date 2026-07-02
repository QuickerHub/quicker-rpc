import MiniSearch from "minisearch";

import type {
  QuickerKnowledgeChunk,
  QuickerKnowledgeSearchResult,
  QuickerKnowledgeSourceType,
} from "@/lib/quicker-knowledge/types";

type IndexedQuickerKnowledgeChunk = {
  id: string;
  title: string;
  section: string;
  sourceType: QuickerKnowledgeSourceType;
  text: string;
};

export type QuickerKnowledgeSearchIndex = {
  index: MiniSearch<IndexedQuickerKnowledgeChunk>;
  chunkById: Map<string, QuickerKnowledgeChunk>;
};

export type SearchQuickerKnowledgeInput = {
  query: string;
  limit?: number;
  sourceType?: Exclude<QuickerKnowledgeSourceType, "docs_index" | "unknown">;
};

const SPLIT_PATTERN = /[\s\-_:./|#*()[\]{}"'`“”‘’.,;!?，。、；：！？《》〈〉（）【】「」『』…]+/u;
const CHINESE_SEQUENCE_PATTERN = /[\u3400-\u9fff]+/gu;

export function tokenizeQuickerKnowledgeText(text: string): string[] {
  const tokens = new Set<string>();
  const lowerText = text.toLocaleLowerCase();

  for (const rawToken of lowerText.split(SPLIT_PATTERN)) {
    const token = rawToken.trim();
    if (token.length > 0) {
      tokens.add(token);
    }

    for (const match of token.matchAll(CHINESE_SEQUENCE_PATTERN)) {
      addChineseTokens(tokens, match[0]);
    }
  }

  return [...tokens];
}

export function buildQuickerKnowledgeKeywordIndex(
  chunks: QuickerKnowledgeChunk[],
): QuickerKnowledgeSearchIndex {
  const index = new MiniSearch<IndexedQuickerKnowledgeChunk>({
    fields: ["title", "section", "sourceType", "text"],
    storeFields: ["id"],
    tokenize: tokenizeQuickerKnowledgeText,
    searchOptions: {
      boost: {
        title: 4,
        section: 3,
        sourceType: 1,
        text: 1,
      },
      fuzzy: 0.15,
      prefix: true,
    },
  });
  const chunkById = new Map<string, QuickerKnowledgeChunk>();

  index.addAll(
    chunks.map((chunk) => {
      chunkById.set(chunk.id, chunk);
      return {
        id: chunk.id,
        title: chunk.title,
        section: chunk.sectionPath.join(" "),
        sourceType: chunk.sourceType,
        text: chunk.text,
      };
    }),
  );

  return { index, chunkById };
}

export function searchQuickerKnowledge(
  bundle: QuickerKnowledgeSearchIndex,
  input: SearchQuickerKnowledgeInput,
): QuickerKnowledgeSearchResult[] {
  const query = input.query.trim();
  if (query.length === 0) {
    return [];
  }

  const limit = clampLimit(input.limit);
  const queryTokens = tokenizeQuickerKnowledgeText(query);
  const results: QuickerKnowledgeSearchResult[] = [];
  const seenChunkIds = new Set<string>();

  for (const hit of bundle.index.search(query)) {
    const chunkId = String(hit.id);
    if (seenChunkIds.has(chunkId)) {
      continue;
    }

    const chunk = bundle.chunkById.get(chunkId);
    if (chunk == null) {
      continue;
    }
    if (input.sourceType != null && chunk.sourceType !== input.sourceType) {
      continue;
    }

    seenChunkIds.add(chunkId);
    results.push({
      chunkId: chunk.id,
      title: chunk.title,
      url: chunk.url,
      sectionPath: chunk.sectionPath,
      sourceType: chunk.sourceType,
      score: hit.score,
      snippet: buildSnippet(chunk.text, queryTokens),
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

function addChineseTokens(tokens: Set<string>, sequence: string): void {
  if (sequence.length < 2) {
    return;
  }

  if (sequence.length <= 12) {
    tokens.add(sequence);
  }

  for (let size = 2; size <= 4; size += 1) {
    if (sequence.length < size) {
      continue;
    }

    for (let start = 0; start <= sequence.length - size; start += 1) {
      tokens.add(sequence.slice(start, start + size));
    }
  }
}

function clampLimit(limit = 6): number {
  if (!Number.isFinite(limit)) {
    return 6;
  }

  return Math.min(12, Math.max(1, Math.trunc(limit)));
}

function buildSnippet(text: string, queryTokens: string[]): string {
  const lowerText = text.toLocaleLowerCase();
  const matchIndex = findFirstMatchIndex(lowerText, queryTokens);
  const center = matchIndex >= 0 ? matchIndex : 0;
  const start = Math.max(0, center - 120);
  const end = Math.min(text.length, center + 260);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";

  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function findFirstMatchIndex(lowerText: string, queryTokens: string[]): number {
  let firstMatch = -1;

  for (const token of queryTokens) {
    const index = lowerText.indexOf(token);
    if (index >= 0 && (firstMatch === -1 || index < firstMatch)) {
      firstMatch = index;
    }
  }

  return firstMatch;
}
