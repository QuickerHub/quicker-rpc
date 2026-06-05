import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import {
  getLocalDirectApiKey,
  getLocalProviderApiKey,
  getLocalProviderConfig,
} from "@/lib/llm-local-secrets";
import { getBundledEndpoints, getBundledProviderApiKey } from "@/lib/llm-bundled-secrets";
import {
  resolveLlmConfigEndpointSlots,
  resolveLlmConfigProvider,
  type LlmEndpointConfig,
  type LlmEndpointFallback,
} from "@/lib/llm-config";
import {
  endpointFingerprint,
  getStickyEndpoint,
  setStickyEndpoint,
} from "@/lib/llm-endpoint-pref";
import {
  CUSTOM_PROVIDER_ID,
  getLlmProviderMeta,
  DEEPSEEK_PROVIDER_ID,
  resolveDeepSeekModelId,
  LLM_PROVIDER_ID,
  parseLlmProviderId,
  type LlmProviderId,
} from "@/lib/llm-providers";
import {
  isCustomProfileConfigured,
  listCustomProfiles,
  resolveProfileSelection,
} from "@/lib/llm-profiles";
import type { LlmSelection } from "@/lib/llm-selection";
import { parseLlmSelection } from "@/lib/llm-selection";

export type { LlmProviderId } from "@/lib/llm-providers";
export type { LlmSelection } from "@/lib/llm-selection";

/** First non-empty env among keys (in order). */
function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

const GPT55_ENV_API_KEYS = [
  "LLM_API_KEY",
  "LLM_BINGLEIMUZI_API_KEY",
  "LLM_AI98PRO_API_KEY",
] as const;

const GPT55_ENV_BASE_URLS = [
  "LLM_BASE_URL",
  "LLM_BINGLEIMUZI_BASE_URL",
  "LLM_AI98PRO_BASE_URL",
] as const;

const GPT55_ENV_MODELS = [
  "LLM_MODEL",
  "LLM_BINGLEIMUZI_MODEL",
  "LLM_AI98PRO_MODEL",
] as const;

const DEEPSEEK_ENV_API_KEYS = ["LLM_DEEPSEEK_API_KEY"] as const;
const DEEPSEEK_ENV_BASE_URLS = ["LLM_DEEPSEEK_BASE_URL"] as const;
const DEEPSEEK_ENV_MODELS = ["LLM_DEEPSEEK_MODEL"] as const;

function resolveApiKey(providerId: LlmProviderId): string | undefined {
  if (providerId === CUSTOM_PROVIDER_ID) {
    const local = getLocalProviderApiKey(CUSTOM_PROVIDER_ID);
    if (local) return local;
    return envFirst("LLM_CUSTOM_API_KEY");
  }
  if (providerId === DEEPSEEK_PROVIDER_ID) {
    const local = getLocalProviderApiKey(DEEPSEEK_PROVIDER_ID);
    if (local) return local;
    const bundled = getBundledProviderApiKey(DEEPSEEK_PROVIDER_ID);
    if (bundled) return bundled;
    return envFirst(...DEEPSEEK_ENV_API_KEYS);
  }

  const local = getLocalProviderApiKey(LLM_PROVIDER_ID);
  if (local) return local;
  const fromConfig = resolveLlmConfigProvider(LLM_PROVIDER_ID)?.apiKey;
  if (fromConfig) return fromConfig;
  const bundled = getBundledProviderApiKey(LLM_PROVIDER_ID);
  if (bundled) return bundled;
  return envFirst(...GPT55_ENV_API_KEYS);
}

function resolveBaseURL(providerId: LlmProviderId): string | undefined {
  if (providerId === CUSTOM_PROVIDER_ID) {
    return (
      getLocalProviderConfig(CUSTOM_PROVIDER_ID)?.baseURL
      ?? envFirst("LLM_CUSTOM_BASE_URL")
    );
  }
  if (providerId === DEEPSEEK_PROVIDER_ID) {
    const bundled = getBundledEndpoints(DEEPSEEK_PROVIDER_ID);
    return (
      getLocalProviderConfig(DEEPSEEK_PROVIDER_ID)?.baseURL
      ?? bundled[0]?.baseURL
      ?? envFirst(...DEEPSEEK_ENV_BASE_URLS)
    );
  }

  const bundled = getBundledEndpoints(LLM_PROVIDER_ID);
  const fromLocal = getLocalProviderConfig(LLM_PROVIDER_ID)?.baseURL;
  if (fromLocal) return fromLocal;
  const fromConfig = resolveLlmConfigProvider(LLM_PROVIDER_ID)?.baseURL;
  if (fromConfig) return fromConfig;
  return (
    bundled[0]?.baseURL
    ?? envFirst(...GPT55_ENV_BASE_URLS)
  );
}

function resolveModelId(providerId: LlmProviderId): string | undefined {
  if (providerId === CUSTOM_PROVIDER_ID) {
    return (
      getLocalProviderConfig(CUSTOM_PROVIDER_ID)?.model
      ?? envFirst("LLM_CUSTOM_MODEL")
    );
  }
  if (providerId === DEEPSEEK_PROVIDER_ID) {
    const bundled = getBundledEndpoints(DEEPSEEK_PROVIDER_ID);
    const raw =
      getLocalProviderConfig(DEEPSEEK_PROVIDER_ID)?.model
      ?? bundled[0]?.model
      ?? envFirst(...DEEPSEEK_ENV_MODELS);
    return raw ? resolveDeepSeekModelId(raw) : undefined;
  }

  const bundled = getBundledEndpoints(LLM_PROVIDER_ID);
  const fromLocal = getLocalProviderConfig(LLM_PROVIDER_ID)?.model;
  if (fromLocal) return fromLocal;
  const fromConfig = resolveLlmConfigProvider(LLM_PROVIDER_ID)?.model;
  if (fromConfig) return fromConfig;
  return (
    bundled[0]?.model
    ?? envFirst(...GPT55_ENV_MODELS)
  );
}

export function getLlmProviderId(): LlmProviderId {
  const raw = process.env.LLM_PROVIDER?.trim();
  if (!raw) return LLM_PROVIDER_ID;
  return parseLlmProviderId(raw) ?? LLM_PROVIDER_ID;
}

function hasDirectApiKey(): boolean {
  return Boolean(getLocalDirectApiKey() || process.env.LLM_API_KEY?.trim());
}

function hasConfiguredFallbacks(): boolean {
  const entry = resolveLlmConfigProvider(LLM_PROVIDER_ID);
  if (entry?.fallbacks?.some((fb) => fb.apiKey)) return true;
  if (getBundledEndpoints(LLM_PROVIDER_ID).length > 1) return true;
  if ((entry?.fallbacks?.length ?? 0) > 0 && getBundledEndpoints(LLM_PROVIDER_ID).length > 0) {
    return true;
  }
  return false;
}

export function isLlmProviderConfigured(providerId: LlmProviderId): boolean {
  if (providerId === CUSTOM_PROVIDER_ID) {
    if (Boolean(resolveApiKey(CUSTOM_PROVIDER_ID))) return true;
    return listCustomProfiles().some(isCustomProfileConfigured);
  }
  if (providerId === DEEPSEEK_PROVIDER_ID) {
    return Boolean(resolveApiKey(DEEPSEEK_PROVIDER_ID));
  }
  if (hasDirectApiKey()) return true;
  if (resolveApiKey(LLM_PROVIDER_ID)) return true;
  return hasConfiguredFallbacks();
}

export type ResolvedLlmConfig = {
  providerId: LlmProviderId;
  apiKey: string;
  baseURL: string;
  modelId: string;
  clientName: string;
};

export type ResolvedLlmEndpoint = ResolvedLlmConfig;

function toEndpoint(
  providerId: LlmProviderId,
  apiKey: string,
  baseURL?: string,
  model?: string,
): ResolvedLlmEndpoint {
  const meta = getLlmProviderMeta(providerId);
  const modelId =
    providerId === DEEPSEEK_PROVIDER_ID
      ? resolveDeepSeekModelId(model) || meta.defaultModel
      : model ?? meta.defaultModel;
  return {
    providerId,
    apiKey,
    baseURL: baseURL ?? meta.defaultBaseURL,
    modelId,
    clientName: meta.clientName,
  };
}

function resolvePreset(providerId: LlmProviderId): ResolvedLlmConfig {
  const meta = getLlmProviderMeta(providerId);
  const apiKey = resolveApiKey(providerId);
  if (!apiKey) {
    throw new Error(
      `LLM provider "${providerId}" has no API key. `
      + "Configure it in Settings or ask your administrator.",
    );
  }
  return {
    providerId,
    apiKey,
    baseURL: resolveBaseURL(providerId) ?? meta.defaultBaseURL,
    modelId: resolveModelId(providerId) ?? meta.defaultModel,
    clientName: meta.clientName,
  };
}

function normalizeOrderedEndpoints(
  endpoints: LlmEndpointConfig[],
  meta: ReturnType<typeof getLlmProviderMeta>,
): LlmEndpointConfig[] {
  return endpoints
    .map((endpoint) => ({
      apiKey: endpoint.apiKey.trim(),
      baseURL: endpoint.baseURL ?? meta.defaultBaseURL,
      model: endpoint.model ?? meta.defaultModel,
    }))
    .filter((endpoint) => endpoint.apiKey);
}

function resolveBuiltinEndpointConfigs(
  providerId: typeof LLM_PROVIDER_ID | typeof DEEPSEEK_PROVIDER_ID,
): LlmEndpointConfig[] {
  const meta = getLlmProviderMeta(providerId);
  const local = getLocalProviderConfig(providerId);
  if (local?.apiKey?.trim()) {
    return [{
      apiKey: local.apiKey.trim(),
      baseURL: local.baseURL ?? meta.defaultBaseURL,
      model: local.model ?? meta.defaultModel,
    }];
  }

  if (providerId === LLM_PROVIDER_ID) {
    const fromConfig = resolveLlmConfigProvider(LLM_PROVIDER_ID);
    if (fromConfig?.apiKey) {
      const chain: LlmEndpointConfig[] = [{
        apiKey: fromConfig.apiKey,
        baseURL: fromConfig.baseURL ?? meta.defaultBaseURL,
        model: fromConfig.model ?? meta.defaultModel,
      }];
      for (const fallback of fromConfig.fallbacks ?? []) {
        if (!fallback.apiKey) continue;
        chain.push({
          apiKey: fallback.apiKey,
          baseURL: fallback.baseURL ?? meta.defaultBaseURL,
          model: fallback.model ?? meta.defaultModel,
        });
      }
      return chain;
    }
  }

  const bundled = getBundledEndpoints(providerId);
  if (bundled.length > 0) {
    return normalizeOrderedEndpoints(bundled, meta);
  }

  if (providerId === LLM_PROVIDER_ID) {
    const configSlots = resolveLlmConfigEndpointSlots(LLM_PROVIDER_ID);
    const inlineConfigChain = configSlots
      .filter((slot) => slot.apiKey?.trim())
      .map((slot) => ({
        apiKey: slot.apiKey!.trim(),
        baseURL: slot.baseURL ?? meta.defaultBaseURL,
        model: slot.model ?? meta.defaultModel,
      }));
    if (inlineConfigChain.length > 0) {
      return inlineConfigChain;
    }
  }

  const envKeys = providerId === DEEPSEEK_PROVIDER_ID
    ? DEEPSEEK_ENV_API_KEYS
    : GPT55_ENV_API_KEYS;
  const envBaseURLs = providerId === DEEPSEEK_PROVIDER_ID
    ? DEEPSEEK_ENV_BASE_URLS
    : GPT55_ENV_BASE_URLS;
  const envModels = providerId === DEEPSEEK_PROVIDER_ID
    ? DEEPSEEK_ENV_MODELS
    : GPT55_ENV_MODELS;
  const envKey = envFirst(...envKeys);
  if (!envKey) return [];
  const model = envFirst(...envModels) ?? meta.defaultModel;
  return [{
    apiKey: envKey,
    baseURL: envFirst(...envBaseURLs) ?? meta.defaultBaseURL,
    model: providerId === DEEPSEEK_PROVIDER_ID
      ? resolveDeepSeekModelId(model)
      : model,
  }];
}

function appendFallbackEndpoints(
  providerId: LlmProviderId,
  chain: ResolvedLlmEndpoint[],
): void {
  if (providerId !== LLM_PROVIDER_ID) return;
  const fallbacks = resolveLlmConfigProvider(LLM_PROVIDER_ID)?.fallbacks;
  if (!fallbacks?.length) return;
  const meta = getLlmProviderMeta(providerId);
  for (const fallback of fallbacks) {
    if (!fallback.apiKey) continue;
    chain.push(
      toEndpoint(
        providerId,
        fallback.apiKey,
        fallback.baseURL ?? meta.defaultBaseURL,
        fallback.model ?? meta.defaultModel,
      ),
    );
  }
}

/** Primary endpoint plus configured fallbacks (deduped by apiKey + baseURL). */
function buildLlmEndpointChain(
  providerOverride?: LlmProviderId,
): ResolvedLlmEndpoint[] {
  const directKey = getLocalDirectApiKey() ?? process.env.LLM_API_KEY?.trim();
  const providerId = providerOverride ?? getLlmProviderId();
  const meta = getLlmProviderMeta(providerId);

  if (providerId === LLM_PROVIDER_ID || providerId === DEEPSEEK_PROVIDER_ID) {
    if (directKey && providerId === LLM_PROVIDER_ID) {
      return [
        {
          providerId,
          apiKey: directKey,
          baseURL: process.env.LLM_BASE_URL?.trim() ?? meta.defaultBaseURL,
          modelId: process.env.LLM_MODEL?.trim() ?? meta.defaultModel,
          clientName: meta.clientName,
        },
      ];
    }

    const configs = resolveBuiltinEndpointConfigs(providerId);
    const chain = configs.map((config) => toEndpoint(
      providerId,
      config.apiKey,
      config.baseURL,
      config.model,
    ));
    if (!chain.length) {
      throw new Error(
        `LLM provider "${providerId}" has no API key. `
        + "Configure it in Settings or ask your administrator.",
      );
    }
    return dedupeEndpoints(chain);
  }

  const chain: ResolvedLlmEndpoint[] = [];
  const primaryKey = resolveApiKey(providerId);
  if (primaryKey) {
    chain.push({
      providerId,
      apiKey: primaryKey,
      baseURL: resolveBaseURL(providerId) ?? meta.defaultBaseURL,
      modelId: resolveModelId(providerId) ?? meta.defaultModel,
      clientName: meta.clientName,
    });
  }
  appendFallbackEndpoints(providerId, chain);

  if (!chain.length) {
    throw new Error(
      `LLM provider "${providerId}" has no API key. `
      + "Configure it in Settings or ask your administrator.",
    );
  }

  return dedupeEndpoints(chain);
}

export function resolveLlmEndpointChain(
  providerOverride?: LlmProviderId,
): ResolvedLlmEndpoint[] {
  const providerId = providerOverride ?? getLlmProviderId();
  return applyStickyEndpointOrder(
    buildLlmEndpointChain(providerOverride),
    providerId,
  );
}

function applyStickyEndpointOrder(
  chain: ResolvedLlmEndpoint[],
  providerId: LlmProviderId,
): ResolvedLlmEndpoint[] {
  if (chain.length <= 1) return chain;
  const sticky = getStickyEndpoint(providerId);
  if (!sticky) return chain;
  const stickyKey = endpointFingerprint(sticky);
  const index = chain.findIndex(
    (endpoint) => endpointFingerprint(endpoint) === stickyKey,
  );
  if (index <= 0) return chain;
  const reordered = [...chain];
  const [preferred] = reordered.splice(index, 1);
  reordered.unshift(preferred);
  return reordered;
}

function rememberSuccessfulEndpoint(
  providerId: LlmProviderId,
  endpoint: ResolvedLlmEndpoint,
  naturalChain: ResolvedLlmEndpoint[],
  index: number,
): void {
  if (naturalChain.length <= 1) return;
  const naturalPrimary = naturalChain[0];
  if (endpointFingerprint(endpoint) !== endpointFingerprint(naturalPrimary)) {
    setStickyEndpoint(providerId, endpoint);
    return;
  }
  if (index > 0 && getStickyEndpoint(providerId)) {
    setStickyEndpoint(providerId, endpoint);
  }
}

function dedupeEndpoints(chain: ResolvedLlmEndpoint[]): ResolvedLlmEndpoint[] {
  const seen = new Set<string>();
  return chain.filter((endpoint) => {
    const key = `${endpoint.baseURL}\0${endpoint.apiKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isRetryableLlmError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const message = error.message.toLowerCase();
  if (
    message.includes("network")
    || message.includes("fetch failed")
    || message.includes("timeout")
    || message.includes("econnrefused")
    || message.includes("enotfound")
    || message.includes("socket")
  ) {
    return true;
  }
  const status = readHttpStatus(error);
  if (status === undefined) return true;
  return status === 401
    || status === 402
    || status === 403
    || status === 408
    || status === 429
    || status >= 500;
}

function readHttpStatus(error: Error): number | undefined {
  const withStatus = error as Error & {
    status?: number;
    statusCode?: number;
    cause?: unknown;
  };
  if (typeof withStatus.status === "number") return withStatus.status;
  if (typeof withStatus.statusCode === "number") return withStatus.statusCode;
  const match = error.message.match(/\b(401|402|403|408|429|5\d{2})\b/);
  return match ? Number(match[1]) : undefined;
}

async function probeLlmEndpoint(
  endpoint: ResolvedLlmEndpoint,
  timeoutMs = 10_000,
): Promise<void> {
  const base = endpoint.baseURL.replace(/\/$/, "");
  const response = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${endpoint.apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(
      `LLM endpoint unavailable (${endpoint.baseURL}): HTTP ${response.status}`,
    );
  }
}

export type LlmProviderProbeResult = {
  configured: boolean;
  reachable: boolean;
  modelId?: string;
  baseURL?: string;
  message?: string;
  latencyMs?: number;
};

/** Probe configured endpoints (same chain/fallback as chat) without creating a model. */
export async function probeLlmProviderAvailability(
  providerId: LlmProviderId,
  options?: { timeoutMs?: number },
): Promise<LlmProviderProbeResult> {
  if (!isLlmProviderConfigured(providerId)) {
    return { configured: false, reachable: false, message: "未配置" };
  }

  let naturalChain: ResolvedLlmEndpoint[];
  try {
    naturalChain = buildLlmEndpointChain(providerId);
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (naturalChain.length === 0) {
    return {
      configured: true,
      reachable: false,
      message: "无可用 endpoint",
    };
  }

  const chain = applyStickyEndpointOrder(naturalChain, providerId);
  const timeoutMs = options?.timeoutMs ?? 10_000;
  let lastError: unknown;

  for (const endpoint of chain) {
    const started = Date.now();
    try {
      await probeLlmEndpoint(endpoint, timeoutMs);
      return {
        configured: true,
        reachable: true,
        modelId: endpoint.modelId,
        baseURL: endpoint.baseURL,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    configured: true,
    reachable: false,
    message: lastError instanceof Error ? lastError.message : "所有 endpoint 不可用",
  };
}

/** Probe a single endpoint config (settings split view). */
export async function probeLlmEndpointConfig(
  providerId: LlmProviderId,
  config: LlmEndpointConfig,
  options?: { timeoutMs?: number },
): Promise<LlmProviderProbeResult> {
  const meta = getLlmProviderMeta(providerId);
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    return { configured: false, reachable: false, message: "未配置" };
  }

  const endpoint = toEndpoint(
    providerId,
    apiKey,
    config.baseURL ?? meta.defaultBaseURL,
    config.model,
  );
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const started = Date.now();
  try {
    await probeLlmEndpoint(endpoint, timeoutMs);
    return {
      configured: true,
      reachable: true,
      modelId: endpoint.modelId,
      baseURL: endpoint.baseURL,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createChatModelFromEndpoint(
  endpoint: ResolvedLlmEndpoint,
): LanguageModel {
  const client = createOpenAICompatible({
    name: endpoint.clientName,
    baseURL: endpoint.baseURL,
    apiKey: endpoint.apiKey,
  });
  return client.chatModel(endpoint.modelId);
}

export type ResolvedChatModel = {
  model: LanguageModel;
  modelId: string;
  endpoint: ResolvedLlmEndpoint;
};

function resolveProfileEndpoint(
  profileId: string,
  modelId: string,
): ResolvedLlmEndpoint {
  const resolved = resolveProfileSelection(profileId, modelId);
  if (!resolved) {
    throw new Error(
      `LLM profile "${profileId}" with model "${modelId}" is not configured.`,
    );
  }
  const { profile } = resolved;
  const meta = getLlmProviderMeta(CUSTOM_PROVIDER_ID);
  return {
    providerId: CUSTOM_PROVIDER_ID,
    apiKey: profile.apiKey,
    baseURL: profile.baseURL,
    modelId: resolved.modelId,
    clientName: `${meta.clientName}-${profile.id.slice(0, 8)}`,
  };
}

export function resolveSelectionEndpoint(selection: LlmSelection): ResolvedLlmEndpoint {
  if (selection.kind === "profile") {
    return resolveProfileEndpoint(selection.profileId, selection.modelId);
  }
  return resolveLlmEndpointChain(selection.providerId)[0]!;
}

export function isLlmSelectionConfigured(selection: LlmSelection): boolean {
  if (selection.kind === "profile") {
    const resolved = resolveProfileSelection(
      selection.profileId,
      selection.modelId,
    );
    return Boolean(resolved && isCustomProfileConfigured(resolved.profile));
  }
  return isLlmProviderConfigured(selection.providerId);
}

export function resolveLlmSelection(
  rawSelection?: string,
  legacyProvider?: LlmProviderId,
): LlmSelection {
  const parsed =
    parseLlmSelection(rawSelection)
    ?? (legacyProvider ? { kind: "builtin" as const, providerId: legacyProvider } : undefined);
  if (parsed) return parsed;
  return { kind: "builtin", providerId: getLlmProviderId() };
}

/** Pick the first reachable endpoint (models probe), then build the chat model. */
export async function resolveChatModelForSelection(
  selectionOverride?: LlmSelection,
): Promise<ResolvedChatModel> {
  const selection = selectionOverride ?? resolveLlmSelection();
  if (selection.kind === "profile") {
    const endpoint = resolveProfileEndpoint(
      selection.profileId,
      selection.modelId,
    );
    return {
      model: createChatModelFromEndpoint(endpoint),
      modelId: endpoint.modelId,
      endpoint,
    };
  }
  return resolveChatModelForRequest(selection.providerId);
}

/** Pick the first reachable endpoint (models probe), then build the chat model. */
export async function resolveChatModelForRequest(
  providerOverride?: LlmProviderId,
): Promise<ResolvedChatModel> {
  const providerId = providerOverride ?? getLlmProviderId();
  const naturalChain = buildLlmEndpointChain(providerOverride);
  const chain = applyStickyEndpointOrder(naturalChain, providerId);
  if (chain.length === 1) {
    const endpoint = chain[0];
    return {
      model: createChatModelFromEndpoint(endpoint),
      modelId: endpoint.modelId,
      endpoint,
    };
  }

  let lastError: unknown;
  for (let index = 0; index < chain.length; index += 1) {
    const endpoint = chain[index];
    try {
      await probeLlmEndpoint(endpoint);
      const configIndex = naturalChain.findIndex(
        (candidate) => endpointFingerprint(candidate) === endpointFingerprint(endpoint),
      );
      rememberSuccessfulEndpoint(
        providerId,
        endpoint,
        naturalChain,
        configIndex >= 0 ? configIndex : index,
      );
      if (configIndex > 0) {
        console.warn(
          `[llm] using fallback endpoint #${configIndex + 1}/${naturalChain.length}: ${endpoint.baseURL}`,
        );
      }
      return {
        model: createChatModelFromEndpoint(endpoint),
        modelId: endpoint.modelId,
        endpoint,
      };
    } catch (error) {
      lastError = error;
      console.warn(
        `[llm] endpoint #${index + 1} failed (${endpoint.baseURL}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const message = lastError instanceof Error
    ? lastError.message
    : "All LLM endpoints failed";
  throw new Error(message);
}

/** Run a non-streaming LLM call with selection-aware routing. */
export async function runLlmWithSelectionFallback<T>(
  rawSelection: string | undefined,
  legacyProvider: LlmProviderId | undefined,
  run: (model: LanguageModel, modelId: string) => Promise<T>,
): Promise<{ result: T; modelId: string }> {
  const selection = resolveLlmSelection(rawSelection, legacyProvider);
  if (selection.kind === "profile") {
    const endpoint = resolveProfileEndpoint(
      selection.profileId,
      selection.modelId,
    );
    const model = createChatModelFromEndpoint(endpoint);
    const result = await run(model, endpoint.modelId);
    return { result, modelId: endpoint.modelId };
  }
  return runLlmWithEndpointFallback(selection.providerId, run);
}

/** Run a non-streaming LLM call with endpoint fallback on retryable errors. */
export async function runLlmWithEndpointFallback<T>(
  providerOverride: LlmProviderId | undefined,
  run: (model: LanguageModel, modelId: string) => Promise<T>,
): Promise<{ result: T; modelId: string }> {
  const providerId = providerOverride ?? getLlmProviderId();
  const naturalChain = buildLlmEndpointChain(providerOverride);
  const chain = applyStickyEndpointOrder(naturalChain, providerId);
  let lastError: unknown;

  for (let index = 0; index < chain.length; index += 1) {
    const endpoint = chain[index];
    try {
      const model = createChatModelFromEndpoint(endpoint);
      const result = await run(model, endpoint.modelId);
      const configIndex = naturalChain.findIndex(
        (candidate) => endpointFingerprint(candidate) === endpointFingerprint(endpoint),
      );
      rememberSuccessfulEndpoint(
        providerId,
        endpoint,
        naturalChain,
        configIndex >= 0 ? configIndex : index,
      );
      if (configIndex > 0) {
        console.warn(
          `[llm] using fallback endpoint #${configIndex + 1}/${naturalChain.length}: ${endpoint.baseURL}`,
        );
      }
      return { result, modelId: endpoint.modelId };
    } catch (error) {
      lastError = error;
      const retryable = isRetryableLlmError(error);
      console.warn(
        `[llm] endpoint #${index + 1} failed (${endpoint.baseURL}):`,
        error instanceof Error ? error.message : error,
      );
      if (!retryable || index === chain.length - 1) break;
    }
  }

  const message = lastError instanceof Error
    ? lastError.message
    : "All LLM endpoints failed";
  throw new Error(message);
}

/**
 * OpenAI-compatible chat endpoint (Zen, NVIDIA integrate, etc.).
 * Uses @ai-sdk/openai-compatible — not @ai-sdk/openai (role mapping differs).
 */
export function resolveLlmConfig(
  providerOverride?: LlmProviderId,
): ResolvedLlmConfig {
  return resolveLlmEndpointChain(providerOverride)[0];
}

export function resolveChatModel(providerOverride?: LlmProviderId) {
  const endpoint = resolveLlmEndpointChain(providerOverride)[0];
  return createChatModelFromEndpoint(endpoint);
}

export function getChatModelId(providerOverride?: LlmProviderId): string {
  return resolveLlmEndpointChain(providerOverride)[0].modelId;
}

export type { LlmEndpointConfig, LlmEndpointFallback };
