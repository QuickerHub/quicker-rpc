import type { WebSearchResultItem } from "@/lib/web-search.shared";
import { WEB_SEARCH_TOOL } from "@/lib/web-search-tool-constants";
import { isStructuredToolResult, type StructuredToolResult } from "@/lib/tool-result";

export type WebSearchResultView = {
  query: string;
  provider: string;
  results: WebSearchResultItem[];
};

function parseResultItem(raw: unknown): WebSearchResultItem | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title.trim() : "";
  const url = typeof row.url === "string" ? row.url.trim() : "";
  if (!title && !url) return null;
  return {
    title: title || url,
    url,
    snippet: typeof row.snippet === "string" ? row.snippet : "",
  };
}

export function parseWebSearchResultView(
  output: unknown,
): WebSearchResultView | null {
  if (!isStructuredToolResult(output) || !output.ok || output.source !== "local") {
    return null;
  }
  const data = output.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (d.action !== "web-search") return null;
  const results = Array.isArray(d.results)
    ? d.results
        .map(parseResultItem)
        .filter((item): item is WebSearchResultItem => item !== null)
    : [];
  return {
    query: typeof d.query === "string" ? d.query : "",
    provider: typeof d.provider === "string" ? d.provider : "",
    results,
  };
}

export function webSearchToolHasPopupVisual(
  toolName: string,
  output: unknown,
): boolean {
  if (toolName !== WEB_SEARCH_TOOL) return false;
  if (parseWebSearchResultView(output)) return true;
  return isStructuredToolResult(output) && !output.ok;
}
