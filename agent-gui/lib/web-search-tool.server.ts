import { tool } from "ai";
import { z } from "zod";
import { formatLocalToolResult } from "@/lib/tool-result";
import { runWebSearch } from "@/lib/web-search.server";
import { WEB_SEARCH_TOOL } from "@/lib/web-search-tool-constants";

export type WebSearchToolInput = {
  query: string;
  limit?: number;
};

export async function executeWebSearchTool(
  input: WebSearchToolInput,
): Promise<Record<string, unknown>> {
  try {
    const result = await runWebSearch(input.query, input.limit);
    const summary = `${result.results.length} 条结果 · ${result.provider}`;
    return formatLocalToolResult({
      action: "web-search",
      success: true,
      summary,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return formatLocalToolResult(
      {
        action: "web-search",
        success: false,
        query: input.query?.trim() ?? "",
        errorMessage: message,
        hint:
          "Default provider is duckduckgo (no API key). "
          + "Set BRAVE_SEARCH_API_KEY or TAVILY_API_KEY (+ optional WEB_SEARCH_PROVIDER) for higher quality.",
      },
      false,
      message,
    );
  }
}

export const WEB_SEARCH_TOOL_DEF = tool({
  description:
    "Search the public internet when facts, vendor API docs, versions, or errors are uncertain — search before answering from memory. "
    + "Returns title/url/snippet list. Retry with refined query if weak. "
    + "NOT for Quicker actions (qkrpc_action_query), authoring guides (docs search), or logged-in pages (browser). "
    + "Default provider: duckduckgo (no key). Optional: BRAVE_SEARCH_API_KEY or TAVILY_API_KEY.",
  inputSchema: z.object({
    query: z.string().describe("Search keywords or question"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Max results (default 5)"),
  }),
  execute: async (input: WebSearchToolInput) => executeWebSearchTool(input),
});

export { WEB_SEARCH_TOOL };
