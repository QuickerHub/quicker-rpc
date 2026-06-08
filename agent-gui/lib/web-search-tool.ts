import type { StructuredToolResult } from "@/lib/tool-result";
import { WEB_SEARCH_TOOL } from "@/lib/web-search-tool-constants";

export { WEB_SEARCH_TOOL };

export function isWebSearchTool(toolName: string): boolean {
  return toolName === WEB_SEARCH_TOOL;
}

export function summarizeWebSearchOutput(output: StructuredToolResult): string | null {
  if (!output.ok || output.source !== "local") return null;
  const data = output.data;
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.action !== "web-search") return null;

  const query = typeof d.query === "string" && d.query ? d.query : "";
  const count = Array.isArray(d.results) ? d.results.length : 0;
  const provider = typeof d.provider === "string" ? d.provider : "";
  const q = query ? ` · ${query.slice(0, 48)}` : "";
  const p = provider ? ` · ${provider}` : "";
  return `${count} 条结果${q}${p}`;
}
