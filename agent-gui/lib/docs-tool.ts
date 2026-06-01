import type { StructuredToolResult } from "@/lib/tool-result";

export const DOCS_GET_TOOL = "docs_get";
export const DOCS_SEARCH_TOOL = "docs_search";
export const DOCS_INDEX_TOOL = "docs_index";

export function isDocsTool(toolName: string): boolean {
  return (
    toolName === DOCS_GET_TOOL
    || toolName === DOCS_SEARCH_TOOL
    || toolName === DOCS_INDEX_TOOL
  );
}

export type DocsGetDoc = {
  topic: string;
  title: string;
  markdown: string;
};

export function parseDocsGetDoc(output: StructuredToolResult): DocsGetDoc | null {
  if (!output.ok || output.source !== "local") return null;
  const data = output.data;
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.action !== "docs-get" || typeof d.markdown !== "string") return null;
  const topic = typeof d.topic === "string" ? d.topic : "doc";
  const title = typeof d.title === "string" && d.title.trim()
    ? d.title.trim()
    : topic;
  return { topic, title, markdown: d.markdown };
}

export function parseDocsGetMarkdown(output: StructuredToolResult): string | null {
  return parseDocsGetDoc(output)?.markdown ?? null;
}

export function summarizeDocsToolOutput(
  toolName: string,
  output: StructuredToolResult,
): string | null {
  if (!output.ok || output.source !== "local") return null;
  const data = output.data;
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;

  if (toolName === DOCS_GET_TOOL && typeof d.title === "string") {
    const topic = typeof d.topic === "string" ? d.topic : "";
    return topic ? `${d.title} · ${topic}` : d.title;
  }

  if (toolName === DOCS_SEARCH_TOOL && Array.isArray(d.items)) {
    const n = typeof d.matchCount === "number" ? d.matchCount : d.items.length;
    const kw = typeof d.keyword === "string" && d.keyword ? ` · ${d.keyword}` : "";
    return `${n} 个主题${kw}`;
  }

  if (toolName === DOCS_INDEX_TOOL && Array.isArray(d.topics)) {
    return `${d.topics.length} 个主题`;
  }

  return null;
}
