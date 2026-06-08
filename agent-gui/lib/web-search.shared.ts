export type WebSearchProvider = "duckduckgo" | "brave" | "tavily";

export type WebSearchResultItem = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchResponse = {
  query: string;
  provider: WebSearchProvider;
  results: WebSearchResultItem[];
};

export function clampWebSearchLimit(limit: number | undefined): number {
  if (limit == null || Number.isNaN(limit)) return 5;
  return Math.min(10, Math.max(1, Math.floor(limit)));
}

function normalizeProvider(value: string | undefined): WebSearchProvider | null {
  const v = value?.trim().toLowerCase();
  if (v === "duckduckgo" || v === "brave" || v === "tavily") return v;
  return null;
}

export type WebSearchEnv = {
  WEB_SEARCH_PROVIDER?: string;
  BRAVE_SEARCH_API_KEY?: string;
  WEB_SEARCH_API_KEY?: string;
  TAVILY_API_KEY?: string;
};

function readWebSearchEnvFromProcess(): WebSearchEnv {
  return {
    WEB_SEARCH_PROVIDER: process.env.WEB_SEARCH_PROVIDER,
    BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY,
    WEB_SEARCH_API_KEY: process.env.WEB_SEARCH_API_KEY,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
  };
}

/** Resolve provider: explicit env > auto-detect API keys > duckduckgo. */
export function resolveWebSearchProvider(env?: WebSearchEnv): WebSearchProvider {
  const resolved = env ?? readWebSearchEnvFromProcess();
  const forced = normalizeProvider(resolved.WEB_SEARCH_PROVIDER);
  if (forced) return forced;

  if (resolved.TAVILY_API_KEY?.trim()) return "tavily";
  if (resolved.BRAVE_SEARCH_API_KEY?.trim() || resolved.WEB_SEARCH_API_KEY?.trim()) {
    return "brave";
  }
  return "duckduckgo";
}

function decodeDuckDuckGoRedirect(href: string): string {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return href;
  } catch {
    return href;
  }
}

function stripHtmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse DuckDuckGo HTML results page (html.duckduckgo.com). */
export function parseDuckDuckGoHtml(html: string, limit: number): WebSearchResultItem[] {
  const results: WebSearchResultItem[] = [];
  const blockRe =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null && results.length < limit) {
    const rawUrl = decodeDuckDuckGoRedirect(match[1] ?? "");
    const title = stripHtmlText(match[2] ?? "");
    if (!rawUrl || !title) continue;

    const tail = html.slice(match.index, match.index + 1200);
    const snippetMatch = tail.match(
      /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    );
    const snippet = snippetMatch ? stripHtmlText(snippetMatch[1] ?? "") : "";

    results.push({ title, url: rawUrl, snippet });
  }

  return results;
}
