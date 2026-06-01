import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import {
  getLlmProviderMeta,
  parseLlmProviderId,
  type LlmProviderId,
} from "@/lib/llm-providers";

export type LlmProviderEntry = {
  apiKey?: string;
  baseURL?: string;
  model?: string;
};

export type LlmConfigFile = {
  version: 1;
  /** Default model menu selection (overridden by LLM_PROVIDER env). */
  defaultProvider?: LlmProviderId;
  providers?: Partial<Record<LlmProviderId, LlmProviderEntry>>;
};

export type ResolvedLlmProviderEntry = {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  source?: "config";
};

const EMPTY: LlmConfigFile = { version: 1, providers: {} };

let cache: LlmConfigFile | null = null;

export function resolveLlmConfigPath(): string {
  const override = process.env.LLM_CONFIG_PATH?.trim();
  if (override) return override;
  return `${resolveAgentGuiRoot()}/llm-config.json`;
}

function normalizeEntry(raw: unknown): LlmProviderEntry | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as LlmProviderEntry;
  const entry: LlmProviderEntry = {};
  if (typeof data.apiKey === "string" && data.apiKey.trim()) {
    entry.apiKey = data.apiKey.trim();
  }
  if (typeof data.baseURL === "string" && data.baseURL.trim()) {
    entry.baseURL = data.baseURL.trim();
  }
  if (typeof data.model === "string" && data.model.trim()) {
    entry.model = data.model.trim();
  }
  if (!entry.apiKey && !entry.baseURL && !entry.model) return undefined;
  return entry;
}

function normalizeConfig(raw: unknown): LlmConfigFile {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY };
  const data = raw as Partial<LlmConfigFile>;
  const providers: Partial<Record<LlmProviderId, LlmProviderEntry>> = {};
  if (typeof data.providers === "object" && data.providers !== null) {
    for (const id of [
      "zen",
      "nvidia",
      "nvidia-minimax",
      "deepseek",
    ] as const) {
      const entry = normalizeEntry(data.providers[id]);
      if (entry) providers[id] = entry;
    }
  }
  const defaultProvider = parseLlmProviderId(data.defaultProvider);
  return { version: 1, defaultProvider, providers };
}

export function loadLlmConfig(): LlmConfigFile {
  if (cache) return cache;
  const path = resolveLlmConfigPath();
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

export function invalidateLlmConfigCache(): void {
  cache = null;
}

export function saveLlmConfig(data: LlmConfigFile): void {
  const path = resolveLlmConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  cache = data;
}

/** Merged entry; nvidia-minimax inherits apiKey/baseURL from nvidia when omitted. */
export function resolveLlmConfigProvider(
  providerId: LlmProviderId,
): ResolvedLlmProviderEntry | undefined {
  const config = loadLlmConfig();
  const entry = config.providers?.[providerId];
  if (providerId !== "nvidia-minimax") {
    return entry ? { ...entry, source: "config" } : undefined;
  }
  const parent = config.providers?.nvidia;
  const merged: LlmProviderEntry = {
    apiKey: entry?.apiKey ?? parent?.apiKey,
    baseURL: entry?.baseURL ?? parent?.baseURL,
    model: entry?.model,
  };
  if (!merged.apiKey && !merged.baseURL && !merged.model) return undefined;
  return { ...merged, source: "config" };
}

export function getLlmConfigDefaultProvider(): LlmProviderId | undefined {
  return loadLlmConfig().defaultProvider;
}

export function patchLlmConfigProviderApiKey(
  providerId: LlmProviderId,
  apiKey: string | undefined,
): void {
  const current = loadLlmConfig();
  const providers = { ...current.providers };
  const prev = providers[providerId] ?? {};
  if (apiKey?.trim()) {
    providers[providerId] = { ...prev, apiKey: apiKey.trim() };
  } else {
    const next = { ...prev };
    delete next.apiKey;
    if (!next.baseURL && !next.model) delete providers[providerId];
    else providers[providerId] = next;
  }
  saveLlmConfig({ ...current, providers });
}

export function getLlmConfigModel(providerId: LlmProviderId): string | undefined {
  const entry = resolveLlmConfigProvider(providerId);
  if (entry?.model) return entry.model;
  return getLlmProviderMeta(providerId).defaultModel;
}
