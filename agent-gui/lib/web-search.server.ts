import "server-only";

import {
  clampWebSearchLimit,
  parseDuckDuckGoHtml,
  resolveWebSearchProvider,
  type WebSearchProvider,
  type WebSearchResponse,
  type WebSearchResultItem,
} from "@/lib/web-search.shared";

export type {
  WebSearchProvider,
  WebSearchResponse,
  WebSearchResultItem,
} from "@/lib/web-search.shared";

export { parseDuckDuckGoHtml, resolveWebSearchProvider } from "@/lib/web-search.shared";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
  + "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function braveApiKey(): string | null {
  return (
    process.env.BRAVE_SEARCH_API_KEY?.trim()
    || process.env.WEB_SEARCH_API_KEY?.trim()
    || null
  );
}

async function searchDuckDuckGo(
  query: string,
  limit: number,
): Promise<WebSearchResultItem[]> {
  const body = new URLSearchParams({ q: query });
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: "text/html",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo search failed: HTTP ${res.status}`);
  }

  const html = await res.text();
  const results = parseDuckDuckGoHtml(html, limit);
  if (results.length === 0) {
    throw new Error("DuckDuckGo returned no parseable results");
  }
  return results;
}

async function searchBrave(
  query: string,
  limit: number,
): Promise<WebSearchResultItem[]> {
  const apiKey = braveApiKey();
  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY or WEB_SEARCH_API_KEY is required for brave provider");
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(limit));

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new Error(`Brave search failed: HTTP ${res.status} ${detail}`);
  }

  const json = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  const items = json.web?.results ?? [];
  const results = items
    .map((item) => ({
      title: item.title?.trim() ?? "",
      url: item.url?.trim() ?? "",
      snippet: item.description?.trim() ?? "",
    }))
    .filter((item) => item.title && item.url)
    .slice(0, limit);

  if (results.length === 0) {
    throw new Error("Brave search returned no results");
  }
  return results;
}

async function searchTavily(
  query: string,
  limit: number,
): Promise<WebSearchResultItem[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is required for tavily provider");
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: limit,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new Error(`Tavily search failed: HTTP ${res.status} ${detail}`);
  }

  const json = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  const results = (json.results ?? [])
    .map((item) => ({
      title: item.title?.trim() ?? "",
      url: item.url?.trim() ?? "",
      snippet: item.content?.trim() ?? "",
    }))
    .filter((item) => item.title && item.url)
    .slice(0, limit);

  if (results.length === 0) {
    throw new Error("Tavily search returned no results");
  }
  return results;
}

export async function runWebSearch(
  query: string,
  limit?: number,
  providerOverride?: WebSearchProvider,
): Promise<WebSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("query is required");
  }

  const capped = clampWebSearchLimit(limit);
  const provider = providerOverride ?? resolveWebSearchProvider();

  let results: WebSearchResultItem[];
  switch (provider) {
    case "brave":
      results = await searchBrave(trimmed, capped);
      break;
    case "tavily":
      results = await searchTavily(trimmed, capped);
      break;
    case "duckduckgo":
      results = await searchDuckDuckGo(trimmed, capped);
      break;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown web search provider: ${String(_exhaustive)}`);
    }
  }

  return { query: trimmed, provider, results };
}
