import "server-only";

import { readWebSearchEnv } from "@/lib/web-search-config";
import { resolveRequestAbortSignal } from "@/lib/request-abort-signal";
import {
  clampWebSearchLimit,
  parseDuckDuckGoHtml,
  resolveWebSearchProvider,
  type WebSearchEnv,
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

export type WebSearchRunOptions = { abortSignal?: AbortSignal };

type WebSearchDependencies = {
  fetch?: typeof globalThis.fetch;
  readEnv?: () => WebSearchEnv;
  timeoutMs?: number;
};

type SearchRequest = {
  fetch: typeof globalThis.fetch;
  signal: AbortSignal;
  env: WebSearchEnv;
};

function braveApiKey(env: WebSearchEnv): string | null {
  return (
    env.BRAVE_SEARCH_API_KEY?.trim()
    || env.WEB_SEARCH_API_KEY?.trim()
    || null
  );
}

async function searchDuckDuckGo(
  query: string,
  limit: number,
  request: SearchRequest,
): Promise<WebSearchResultItem[]> {
  const body = new URLSearchParams({ q: query });
  request.signal.throwIfAborted();
  const res = await request.fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": DEFAULT_USER_AGENT,
      Accept: "text/html",
    },
    body: body.toString(),
    signal: request.signal,
  });
  request.signal.throwIfAborted();

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
  request: SearchRequest,
): Promise<WebSearchResultItem[]> {
  const apiKey = braveApiKey(request.env);
  if (!apiKey) {
    throw new Error("BRAVE_SEARCH_API_KEY or WEB_SEARCH_API_KEY is required for brave provider");
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(limit));

  request.signal.throwIfAborted();
  const res = await request.fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: request.signal,
  });
  request.signal.throwIfAborted();

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
  request: SearchRequest,
): Promise<WebSearchResultItem[]> {
  const apiKey = request.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is required for tavily provider");
  }

  request.signal.throwIfAborted();
  const res = await request.fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: limit,
      include_answer: false,
    }),
    signal: request.signal,
  });
  request.signal.throwIfAborted();

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

export function createWebSearchRunner(dependencies: WebSearchDependencies = {}) {
  return async function runWebSearch(
    query: string,
    limit?: number,
    providerOverride?: WebSearchProvider,
    options?: WebSearchRunOptions,
  ): Promise<WebSearchResponse> {
    const abortSignal = resolveRequestAbortSignal(options?.abortSignal);
    abortSignal?.throwIfAborted();
    const trimmed = query.trim();
    if (!trimmed) throw new Error("query is required");

    const env = providerOverride === "duckduckgo" ? {} : (dependencies.readEnv ?? readWebSearchEnv)();
    abortSignal?.throwIfAborted();
    const capped = clampWebSearchLimit(limit);
    const provider = providerOverride ?? resolveWebSearchProvider(env);
    const deadline = new AbortController();
    const timer = setTimeout(() => {
      deadline.abort(new DOMException("Web search timed out", "TimeoutError"));
    }, dependencies.timeoutMs ?? 20_000);
    const signal = abortSignal ? AbortSignal.any([abortSignal, deadline.signal]) : deadline.signal;
    const request = { fetch: dependencies.fetch ?? globalThis.fetch, signal, env };
    try {
      let results: WebSearchResultItem[];
      switch (provider) {
        case "brave":
          results = await searchBrave(trimmed, capped, request);
          break;
        case "tavily":
          results = await searchTavily(trimmed, capped, request);
          break;
        case "duckduckgo":
          results = await searchDuckDuckGo(trimmed, capped, request);
          break;
        default: {
          const _exhaustive: never = provider;
          throw new Error(`Unknown web search provider: ${String(_exhaustive)}`);
        }
      }
      signal.throwIfAborted();
      return { query: trimmed, provider, results };
    } catch (error) {
      // Preserve cancellation even if a transport reports a generic failure or late result.
      abortSignal?.throwIfAborted();
      signal.throwIfAborted();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

export const runWebSearch = createWebSearchRunner();
