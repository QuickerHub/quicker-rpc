import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import {
  getLlmProviderMeta,
  LLM_PROVIDER_ID,
  type LlmProviderId,
} from "@/lib/llm-providers";

export type LlmEndpointConfig = {
  apiKey: string;
  baseURL?: string;
  model?: string;
};

/** @deprecated alias */
export type LlmEndpointFallback = LlmEndpointConfig;

export type LlmProviderEntry = {
  /** Primary endpoint (preferred over legacy flat apiKey/baseURL/model). */
  default?: LlmEndpointConfig;
  apiKey?: string;
  baseURL?: string;
  model?: string;
  /** When true, omit from model selector (API keys still work if configured). */
  hidden?: boolean;
  /** Tried in order when the primary endpoint fails. */
  fallbacks?: LlmEndpointConfig[];
};

export type LlmConfigFile = {
  version: 1;
  /** @deprecated ignored — always GPT-5.5 */
  defaultProvider?: LlmProviderId;
  /** GPT-5.5 endpoint config (`providers.default` in llm-config.json). */
  provider?: LlmProviderEntry;
};

export type ResolvedLlmProviderEntry = LlmProviderEntry & {
  source?: "config";
};

const EMPTY: LlmConfigFile = { version: 1 };

let cache: LlmConfigFile | null = null;

export function resolveLlmConfigPath(): string {
  const override = process.env.LLM_CONFIG_PATH?.trim();
  if (override) return override;
  return `${resolveAgentGuiRoot()}/llm-config.json`;
}

function normalizeEndpointConfig(raw: unknown): LlmEndpointConfig | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as LlmEndpointConfig;
  const apiKey = typeof data.apiKey === "string" ? data.apiKey.trim() : "";
  if (!apiKey) return undefined;
  const next: LlmEndpointConfig = { apiKey };
  if (typeof data.baseURL === "string" && data.baseURL.trim()) {
    next.baseURL = data.baseURL.trim();
  }
  if (typeof data.model === "string" && data.model.trim()) {
    next.model = data.model.trim();
  }
  return next;
}

function normalizeEntry(raw: unknown): LlmProviderEntry | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as LlmProviderEntry & Record<string, unknown>;
  const entry: LlmProviderEntry = {};

  const defaultEndpoint = normalizeEndpointConfig(data.default);
  if (defaultEndpoint) {
    entry.default = defaultEndpoint;
    entry.apiKey = defaultEndpoint.apiKey;
    if (defaultEndpoint.baseURL) entry.baseURL = defaultEndpoint.baseURL;
    if (defaultEndpoint.model) entry.model = defaultEndpoint.model;
  } else {
    if (typeof data.apiKey === "string" && data.apiKey.trim()) {
      entry.apiKey = data.apiKey.trim();
    }
    if (typeof data.baseURL === "string" && data.baseURL.trim()) {
      entry.baseURL = data.baseURL.trim();
    }
    if (typeof data.model === "string" && data.model.trim()) {
      entry.model = data.model.trim();
    }
  }

  if (data.hidden === true) entry.hidden = true;
  if (Array.isArray(data.fallbacks)) {
    const fallbacks: LlmEndpointConfig[] = [];
    for (const rawFallback of data.fallbacks) {
      const fb = normalizeEndpointConfig(rawFallback);
      if (fb) fallbacks.push(fb);
    }
    if (fallbacks.length) entry.fallbacks = fallbacks;
  }
  if (
    !entry.apiKey
    && !entry.baseURL
    && !entry.model
    && !entry.hidden
    && !entry.fallbacks?.length
  ) {
    return undefined;
  }
  return entry;
}

function readProviderEntry(raw: unknown): LlmProviderEntry | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as Record<string, unknown>;
  const providers = data.providers;
  if (typeof providers === "object" && providers !== null) {
    const map = providers as Record<string, unknown>;
    return (
      normalizeEntry(map.default)
      ?? normalizeEntry(map.bingleimuzi)
      ?? normalizeEntry(map.ai98pro)
    );
  }
  return normalizeEntry(data.default) ?? normalizeEntry(data);
}

function normalizeConfig(raw: unknown): LlmConfigFile {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY };
  const provider = readProviderEntry(raw);
  return provider ? { version: 1, provider } : { ...EMPTY };
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
  providerId: LlmProviderId = LLM_PROVIDER_ID,
): ResolvedLlmProviderEntry | undefined {
  if (providerId !== LLM_PROVIDER_ID) return undefined;
  const entry = loadLlmConfig().provider;
  return entry ? { ...entry, source: "config" } : undefined;
}

/** Primary endpoint plus fallbacks (apiKey may be empty when keys are bundled). */
export function resolveLlmConfigEndpointSlots(
  providerId: LlmProviderId = LLM_PROVIDER_ID,
): LlmEndpointConfig[] {
  if (providerId !== LLM_PROVIDER_ID) return [];
  const entry = resolveLlmConfigProvider(providerId);
  if (!entry) return [];

  const slots: LlmEndpointConfig[] = [];
  const primary: LlmEndpointConfig = { apiKey: entry.apiKey ?? "" };
  if (entry.baseURL) primary.baseURL = entry.baseURL;
  if (entry.model) primary.model = entry.model;
  if (primary.apiKey || primary.baseURL || primary.model) {
    slots.push(primary);
  }

  for (const fallback of entry.fallbacks ?? []) {
    slots.push({ ...fallback });
  }
  return slots;
}

export function getLlmConfigDefaultProvider(): LlmProviderId {
  return LLM_PROVIDER_ID;
}

export function patchLlmConfigProviderApiKey(
  providerId: LlmProviderId,
  apiKey: string | undefined,
): void {
  if (providerId !== LLM_PROVIDER_ID) return;
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
  if (providerId !== LLM_PROVIDER_ID) return;
  const current = loadLlmConfig();
  const prev = current.provider ?? {};
  const next: LlmProviderEntry = { ...prev };
  const meta = getLlmProviderMeta();

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

  const provider = !next.apiKey && !next.baseURL && !next.model && !next.hidden
    ? undefined
    : next;

  saveLlmConfig({ ...current, provider });
}

export function getLlmConfigModel(
  _providerId: LlmProviderId = LLM_PROVIDER_ID,
): string | undefined {
  const entry = resolveLlmConfigProvider(_providerId);
  if (entry?.model) return entry.model;
  return getLlmProviderMeta(_providerId).defaultModel;
}

export function isLlmProviderHidden(
  _providerId: LlmProviderId = LLM_PROVIDER_ID,
): boolean {
  return loadLlmConfig().provider?.hidden === true;
}

export function resolveVisibleDefaultProvider(): LlmProviderId {
  return LLM_PROVIDER_ID;
}
