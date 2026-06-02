import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import {
  getLlmProviderMeta,
  LLM_PROVIDER_LIST,
  parseLlmProviderId,
  type LlmProviderId,
} from "@/lib/llm-providers";

export type LlmProviderEntry = {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  /** When true, omit from model selector (API keys still work if configured). */
  hidden?: boolean;
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
  if (data.hidden === true) entry.hidden = true;
  if (!entry.apiKey && !entry.baseURL && !entry.model && !entry.hidden) {
    return undefined;
  }
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
      "deepseek",
      "chatanywhere",
      "ai98pro",
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

export function resolveLlmConfigProvider(
  providerId: LlmProviderId,
): ResolvedLlmProviderEntry | undefined {
  const entry = loadLlmConfig().providers?.[providerId];
  return entry ? { ...entry, source: "config" } : undefined;
}

export function getLlmConfigDefaultProvider(): LlmProviderId | undefined {
  return loadLlmConfig().defaultProvider;
}

export function patchLlmConfigProviderApiKey(
  providerId: LlmProviderId,
  apiKey: string | undefined,
): void {
  patchLlmConfigProvider(providerId, { apiKey: apiKey ?? null });
}

export type LlmProviderPatch = {
  apiKey?: string | null;
  baseURL?: string | null;
  model?: string | null;
};

export function patchLlmConfigProvider(
  providerId: LlmProviderId,
  patch: LlmProviderPatch,
): void {
  const current = loadLlmConfig();
  const providers = { ...current.providers };
  const prev = providers[providerId] ?? {};
  const next: LlmProviderEntry = { ...prev };
  const meta = getLlmProviderMeta(providerId);

  if (patch.apiKey !== undefined) {
    const trimmed = patch.apiKey?.trim() ?? "";
    if (trimmed) next.apiKey = trimmed;
    else delete next.apiKey;
  }

  if (patch.baseURL !== undefined) {
    const trimmed = patch.baseURL?.trim() ?? "";
    if (trimmed && trimmed !== meta.defaultBaseURL) next.baseURL = trimmed;
    else delete next.baseURL;
  }

  if (patch.model !== undefined) {
    const trimmed = patch.model?.trim() ?? "";
    if (trimmed && trimmed !== meta.defaultModel) next.model = trimmed;
    else delete next.model;
  }

  if (!next.apiKey && !next.baseURL && !next.model && !next.hidden) {
    delete providers[providerId];
  } else {
    providers[providerId] = next;
  }

  saveLlmConfig({ ...current, providers });
}

export function getLlmConfigModel(providerId: LlmProviderId): string | undefined {
  const entry = resolveLlmConfigProvider(providerId);
  if (entry?.model) return entry.model;
  return getLlmProviderMeta(providerId).defaultModel;
}

export function isLlmProviderHidden(providerId: LlmProviderId): boolean {
  return loadLlmConfig().providers?.[providerId]?.hidden === true;
}

/** First visible provider id that passes `predicate`, else undefined. */
export function findVisibleLlmProvider(
  predicate: (id: LlmProviderId) => boolean,
): LlmProviderId | undefined {
  for (const meta of LLM_PROVIDER_LIST) {
    if (isLlmProviderHidden(meta.id)) continue;
    if (predicate(meta.id)) return meta.id;
  }
  return undefined;
}

export function resolveVisibleDefaultProvider(): LlmProviderId {
  const fromConfig = getLlmConfigDefaultProvider();
  if (fromConfig && !isLlmProviderHidden(fromConfig)) return fromConfig;
  return findVisibleLlmProvider(() => true) ?? "deepseek";
}
