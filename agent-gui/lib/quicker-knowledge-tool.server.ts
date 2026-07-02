import "server-only";

import { stat } from "node:fs/promises";
import { tool } from "ai";
import { z } from "zod";
import { reciprocalRankFusion } from "@/lib/quicker-knowledge/hybrid";
import {
  buildQuickerKnowledgeKeywordIndex,
  searchQuickerKnowledge,
  type QuickerKnowledgeSearchIndex,
} from "@/lib/quicker-knowledge/search";
import {
  hasQuickerKnowledgeCorpus,
  loadQuickerKnowledgeChunksFromJsonl,
  resolveDefaultQuickerKnowledgeChunksPath,
} from "@/lib/quicker-knowledge/store.server";
import type {
  QuickerKnowledgeChunk,
  QuickerKnowledgeSearchResult,
} from "@/lib/quicker-knowledge/types";
import { formatLocalToolResult } from "@/lib/tool-result";
import { formatToolResultForAgent } from "@/lib/tool-result-agent-view";
import { QUICKER_KNOWLEDGE_SEARCH_TOOL } from "@/lib/quicker-knowledge-tool-constants";

export type QuickerKnowledgeSearchToolInput = {
  query: string;
  limit?: number;
  sourceType?: "manual" | "action_dev" | "kb";
};

const quickerKnowledgeSearchInputSchema = z.object({
  query: z.string().describe("Quicker website knowledge search query"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe("Max results (default 6, max 12)"),
  sourceType: z
    .enum(["manual", "action_dev", "kb"])
    .optional()
    .describe("Limit results to a Quicker website source type"),
});

let cachedIndex:
  | {
      cacheKey: string;
      index: QuickerKnowledgeSearchIndex;
    }
  | undefined;

function formatFailure(
  data: Record<string, unknown>,
  error: string,
): Record<string, unknown> {
  return {
    ...formatLocalToolResult(data, false, error),
    error,
  };
}

async function loadKeywordIndex(): Promise<QuickerKnowledgeSearchIndex> {
  const corpusPath = resolveDefaultQuickerKnowledgeChunksPath();
  if (!hasQuickerKnowledgeCorpus(corpusPath)) {
    throw new Error(
      "Quicker knowledge corpus is missing. Run the Quicker website knowledge ingest/build task first.",
    );
  }

  const corpusStat = await stat(corpusPath);
  const chunks = await loadQuickerKnowledgeChunksFromJsonl(corpusPath);
  const cacheKey = [
    corpusPath,
    corpusStat.mtimeMs,
    corpusStat.size,
    buildCorpusSignature(chunks),
  ].join("|");

  if (cachedIndex?.cacheKey === cacheKey) {
    return cachedIndex.index;
  }

  const index = buildQuickerKnowledgeKeywordIndex(chunks);
  cachedIndex = {
    cacheKey,
    index,
  };
  return index;
}

function buildCorpusSignature(chunks: QuickerKnowledgeChunk[]): string {
  return chunks
    .map((chunk) => `${chunk.id}:${chunk.contentHash}`)
    .join(",");
}

export async function executeQuickerKnowledgeSearchTool(
  input: QuickerKnowledgeSearchToolInput,
): Promise<Record<string, unknown>> {
  const query = input.query?.trim() ?? "";
  if (query.length === 0) {
    return formatFailure(
      {
        action: "quicker-knowledge-search",
        success: false,
        query,
        errorMessage: "query is required",
      },
      "query is required",
    );
  }

  let index: QuickerKnowledgeSearchIndex;
  try {
    index = await loadKeywordIndex();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return formatFailure(
      {
        action: "quicker-knowledge-search",
        success: false,
        query,
        errorMessage: message,
        hint:
          "The local Quicker website knowledge corpus is not available. "
          + "Run the website RAG corpus build/ingest step, then retry.",
      },
      message,
    );
  }

  const keyword = searchQuickerKnowledge(index, {
    query,
    limit: input.limit,
    sourceType: input.sourceType,
  });
  const results: QuickerKnowledgeSearchResult[] = reciprocalRankFusion({
    keyword,
    vector: [],
    limit: input.limit,
  });

  return formatToolResultForAgent(
    QUICKER_KNOWLEDGE_SEARCH_TOOL,
    input,
    formatLocalToolResult({
      action: "quicker-knowledge-search",
      success: true,
      query,
      mode: "keyword",
      results,
      hint:
        results.length > 0
          ? "Cite result URLs when answering from Quicker website knowledge."
          : "No results found. Refine the query with Quicker product terms, settings names, UI labels, or module names.",
    }),
  );
}

export const QUICKER_KNOWLEDGE_SEARCH_TOOL_DEF = tool({
  description:
    "Search official public Quicker website knowledge for product usage, settings, UI, install, sync, account, common modules, and docs. "
    + "Use this before answering Quicker public website knowledge questions, and cite result URLs. "
    + "Do NOT use for local action editing, step-runner schemas, qkrpc authoring, workspace files, or private/local Quicker data.",
  inputSchema: quickerKnowledgeSearchInputSchema,
  execute: async (input: QuickerKnowledgeSearchToolInput) =>
    executeQuickerKnowledgeSearchTool(input),
});
