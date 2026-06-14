import type {
  ActionAuthoringLayerGroup,
  ActionAuthoringSearchItem,
  ActionAuthoringTopicMeta,
} from "@/lib/action-authoring-docs.shared";
import { groupTopicsByLayer } from "@/lib/action-authoring-docs.shared";
import {
  isDocsTool,
  parseDocsGetDoc,
  type DocsGetDoc,
} from "@/lib/docs-tool";
import { isStructuredToolResult, type StructuredToolResult } from "@/lib/tool-result";

export type DocsSearchResultView = {
  keyword: string | null;
  scope: string | null;
  matchCount: number;
  items: ActionAuthoringSearchItem[];
};

export type DocsIndexResultView = {
  topicCount: number;
  topics: ActionAuthoringTopicMeta[];
  layerGroups: ActionAuthoringLayerGroup[];
};

export type DocsSnippetResultView = {
  topic: string;
  title: string;
  snippet: string;
  reference?: string;
  section?: string;
};

function readDocsData(output: StructuredToolResult): Record<string, unknown> | null {
  if (!output.ok || output.source !== "local") return null;
  const data = output.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

function parseSearchItem(raw: unknown): ActionAuthoringSearchItem | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const topic = typeof row.topic === "string" ? row.topic : "";
  const title = typeof row.title === "string" ? row.title : "";
  const description = typeof row.description === "string" ? row.description : "";
  const excerpt = typeof row.excerpt === "string" ? row.excerpt : "";
  const snippet = typeof row.snippet === "string" ? row.snippet : "";
  if (!topic || !title || !snippet) return null;
  return {
    topic,
    title,
    description,
    excerpt,
    snippet,
    reference: typeof row.reference === "string" ? row.reference : undefined,
    section: typeof row.section === "string" ? row.section : undefined,
    score: typeof row.score === "number" ? row.score : undefined,
  };
}

function parseTopicMeta(raw: unknown): ActionAuthoringTopicMeta | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const topic = typeof row.topic === "string" ? row.topic : "";
  const title = typeof row.title === "string" ? row.title : "";
  const description = typeof row.description === "string" ? row.description : "";
  const charCount = typeof row.charCount === "number" ? row.charCount : 0;
  if (!topic || !title) return null;
  return {
    topic,
    title,
    description,
    charCount,
    layer: typeof row.layer === "string" ? row.layer : undefined,
    references: Array.isArray(row.references)
      ? row.references
          .map((ref) => {
            if (typeof ref !== "object" || ref === null || Array.isArray(ref)) {
              return null;
            }
            const r = ref as Record<string, unknown>;
            const id = typeof r.id === "string" ? r.id : "";
            const refTitle = typeof r.title === "string" ? r.title : "";
            if (!id || !refTitle) return null;
            return {
              id,
              title: refTitle,
              searchAliases: Array.isArray(r.searchAliases)
                ? r.searchAliases.filter((a): a is string => typeof a === "string")
                : undefined,
            };
          })
          .filter((ref): ref is NonNullable<typeof ref> => ref !== null)
      : undefined,
  };
}

export function parseDocsSearchResult(
  output: StructuredToolResult,
): DocsSearchResultView | null {
  const data = readDocsData(output);
  if (!data || data.action !== "docs-search") return null;
  const items = Array.isArray(data.items)
    ? data.items
        .map(parseSearchItem)
        .filter((item): item is ActionAuthoringSearchItem => item !== null)
    : [];
  return {
    keyword: typeof data.keyword === "string" ? data.keyword : null,
    scope: typeof data.scope === "string" ? data.scope : null,
    matchCount:
      typeof data.matchCount === "number" ? data.matchCount : items.length,
    items,
  };
}

export function parseDocsIndexResult(
  output: StructuredToolResult,
): DocsIndexResultView | null {
  const data = readDocsData(output);
  if (!data || data.action !== "docs-index") return null;
  const topics = Array.isArray(data.topics)
    ? data.topics
        .map(parseTopicMeta)
        .filter((topic): topic is ActionAuthoringTopicMeta => topic !== null)
    : [];
  const layerGroups = Array.isArray(data.layerGroups)
    ? (data.layerGroups as ActionAuthoringLayerGroup[])
    : groupTopicsByLayer(topics);
  return {
    topicCount: topics.length,
    topics,
    layerGroups,
  };
}

export function parseDocsSnippetResult(
  output: StructuredToolResult,
): DocsSnippetResultView | null {
  const data = readDocsData(output);
  if (!data || data.action !== "docs-get" || data.mode !== "snippet") return null;
  const topic = typeof data.topic === "string" ? data.topic : "";
  const title = typeof data.title === "string" ? data.title : topic;
  const snippet =
    typeof data.snippet === "string"
      ? data.snippet
      : typeof data.markdown === "string"
        ? data.markdown
        : "";
  if (!topic || !snippet.trim()) return null;
  return {
    topic,
    title,
    snippet,
    reference: typeof data.reference === "string" ? data.reference : undefined,
    section: typeof data.section === "string" ? data.section : undefined,
  };
}

export function parseDocsVisualDoc(output: StructuredToolResult): DocsGetDoc | null {
  return parseDocsGetDoc(output) ?? null;
}

export type DocsToolInlineResult =
  | { kind: "search"; view: DocsSearchResultView }
  | { kind: "index"; view: DocsIndexResultView }
  | { kind: "snippet"; view: DocsSnippetResultView }
  | { kind: "get"; doc: DocsGetDoc };

export function parseDocsToolInlineResult(
  output: StructuredToolResult,
): DocsToolInlineResult | null {
  if (!output.ok || output.source !== "local") return null;
  const search = parseDocsSearchResult(output);
  if (search) return { kind: "search", view: search };
  const index = parseDocsIndexResult(output);
  if (index) return { kind: "index", view: index };
  const snippet = parseDocsSnippetResult(output);
  if (snippet) return { kind: "snippet", view: snippet };
  const doc = parseDocsVisualDoc(output);
  if (doc) return { kind: "get", doc };
  return null;
}

export function docsToolHasPopupVisual(
  toolName: string,
  _input: unknown,
  output: unknown,
): boolean {
  if (!isDocsTool(toolName) || !isStructuredToolResult(output)) return false;
  if (parseDocsToolInlineResult(output)) return true;
  return !output.ok;
}
