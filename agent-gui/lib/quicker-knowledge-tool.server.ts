import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { reciprocalRankFusion } from "@/lib/quicker-knowledge/hybrid";
import { searchQuickerKnowledge } from "@/lib/quicker-knowledge/search";
import {
  createQuickerKnowledgeIndexLoader,
  type QuickerKnowledgeKeywordSnapshot,
} from "@/lib/quicker-knowledge/index-provider.server";
import type { QuickerKnowledgeSearchResult } from "@/lib/quicker-knowledge/types";
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

const loadKeywordIndex = createQuickerKnowledgeIndexLoader();

function knowledgeSource(snapshot?: QuickerKnowledgeKeywordSnapshot) {
  return {
    schemaVersion: 1,
    source: { provider: "quicker.website-corpus", kind: "local-corpus" },
    schema: {
      format: "quicker-knowledge.chunks.jsonl.v1",
      revision: snapshot?.revision ?? "unknown",
    },
    retrievedAt: snapshot?.retrievedAt ?? null,
  };
}

function formatFailure(
  data: Record<string, unknown>,
  error: string,
): Record<string, unknown> {
  return {
    ...formatLocalToolResult(data, false, error),
    error,
  };
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
        knowledge: knowledgeSource(),
      },
      "query is required",
    );
  }

  let snapshot: QuickerKnowledgeKeywordSnapshot;
  try {
    snapshot = await loadKeywordIndex();
  } catch (error) {
    const message = error != null && typeof error === "object" && "code" in error && error.code === "ENOENT"
      ? "Quicker knowledge corpus is missing. Run the Quicker website knowledge ingest/build task first."
      : error instanceof Error ? error.message : String(error);
    return formatFailure(
      {
        action: "quicker-knowledge-search",
        success: false,
        query,
        errorMessage: message,
        knowledge: knowledgeSource(),
        hint:
          "The local Quicker website knowledge corpus is not available. "
          + "Run the website RAG corpus build/ingest step, then retry.",
      },
      message,
    );
  }

  const keyword = searchQuickerKnowledge(snapshot.index, {
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
      knowledge: knowledgeSource(snapshot),
      results,
      hint:
        results.length > 0
          ? "Cite result URLs and their recorded fetchedAt when available. These are local corpus snapshots, not current online or native host facts."
          : "No results found. Refine the query with Quicker product terms, settings names, UI labels, or module names.",
    }),
  );
}

export const QUICKER_KNOWLEDGE_SEARCH_TOOL_DEF = tool({
  description:
    "Search the locally stored public Quicker website corpus for product usage, settings, UI, install, sync, account, common modules, and docs. "
    + "This reads an existing local snapshot; it does not fetch current online or native host knowledge. "
    + "Use this before answering Quicker public website knowledge questions, and cite result URLs. "
    + "Do NOT use for local action editing, step-runner schemas, qkrpc authoring, workspace files, or private/local Quicker data.",
  inputSchema: quickerKnowledgeSearchInputSchema,
  execute: async (input: QuickerKnowledgeSearchToolInput) =>
    executeQuickerKnowledgeSearchTool(input),
});
