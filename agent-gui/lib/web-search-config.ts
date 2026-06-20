import { existsSync, readFileSync } from "node:fs";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import type { WebSearchEnv, WebSearchProvider } from "@/lib/web-search.shared";

export type WebSearchConfigFile = {
  version: 1;
  provider?: WebSearchProvider;
  /** Used when provider is tavily or brave. */
  apiKey?: string;
  tavilyApiKey?: string;
  braveApiKey?: string;
};

const EMPTY: WebSearchConfigFile = { version: 1 };

let cache: WebSearchConfigFile | null = null;

export function resolveWebSearchConfigPath(): string {
  const override = process.env.WEB_SEARCH_CONFIG_PATH?.trim();
  if (override) return override;
  return `${resolveAgentGuiRoot()}/web-search-config.json`;
}

function normalizeProvider(value: unknown): WebSearchProvider | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  if (v === "duckduckgo" || v === "brave" || v === "tavily") return v;
  return undefined;
}

function normalizeConfig(raw: unknown): WebSearchConfigFile {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY };
  const data = raw as WebSearchConfigFile;
  const provider = normalizeProvider(data.provider);
  const apiKey = typeof data.apiKey === "string" ? data.apiKey.trim() : "";
  const tavilyApiKey =
    typeof data.tavilyApiKey === "string" ? data.tavilyApiKey.trim() : "";
  const braveApiKey =
    typeof data.braveApiKey === "string" ? data.braveApiKey.trim() : "";
  if (!provider && !apiKey && !tavilyApiKey && !braveApiKey) return { ...EMPTY };
  return {
    version: 1,
    ...(provider ? { provider } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(tavilyApiKey ? { tavilyApiKey } : {}),
    ...(braveApiKey ? { braveApiKey } : {}),
  };
}

export function loadWebSearchConfig(): WebSearchConfigFile {
  if (cache) return cache;
  const path = resolveWebSearchConfigPath();
  if (!existsSync(path)) {
    cache = { ...EMPTY };
    return cache;
  }
  try {
    cache = normalizeConfig(JSON.parse(readFileSync(path, "utf8")) as unknown);
    return cache;
  } catch {
    cache = { ...EMPTY };
    return cache;
  }
}

export function invalidateWebSearchConfigCache(): void {
  cache = null;
}

function pickEnvValue(
  processValue: string | undefined,
  configValue: string | undefined,
): string | undefined {
  const fromProcess = processValue?.trim();
  if (fromProcess) return fromProcess;
  const fromConfig = configValue?.trim();
  return fromConfig || undefined;
}

/** Merge process.env with web-search-config.json (env wins). */
export function readWebSearchEnv(): WebSearchEnv {
  const config = loadWebSearchConfig();
  const sharedKey = config.apiKey?.trim() ?? "";
  const tavilyFromConfig =
    config.tavilyApiKey?.trim()
    || (config.provider === "tavily" ? sharedKey : "");
  const braveFromConfig =
    config.braveApiKey?.trim()
    || (config.provider === "brave" ? sharedKey : "")
    || sharedKey;

  return {
    WEB_SEARCH_PROVIDER: pickEnvValue(
      process.env.WEB_SEARCH_PROVIDER,
      config.provider,
    ),
    TAVILY_API_KEY: pickEnvValue(process.env.TAVILY_API_KEY, tavilyFromConfig),
    BRAVE_SEARCH_API_KEY: pickEnvValue(
      process.env.BRAVE_SEARCH_API_KEY,
      braveFromConfig,
    ),
    WEB_SEARCH_API_KEY: pickEnvValue(
      process.env.WEB_SEARCH_API_KEY,
      config.provider === "brave" ? sharedKey : "",
    ),
  };
}
