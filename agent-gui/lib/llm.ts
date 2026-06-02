import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import {
  getLocalDirectApiKey,
  getLocalProviderApiKey,
  getLocalProviderConfig,
} from "@/lib/llm-local-secrets";
import { getBundledProviderApiKey } from "@/lib/llm-bundled-secrets";
import {
  resolveLlmConfigProvider,
  type LlmEndpointConfig,
  type LlmEndpointFallback,
} from "@/lib/llm-config";
import {
  CUSTOM_PROVIDER_ID,
  getLlmProviderMeta,
  DEEPSEEK_PROVIDER_ID,
  resolveDeepSeekModelId,
  LLM_PROVIDER_ID,
  parseLlmProviderId,
  type LlmProviderId,
} from "@/lib/llm-providers";

export type { LlmProviderId } from "@/lib/llm-providers";

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
    return (
      getLocalProviderConfig(DEEPSEEK_PROVIDER_ID)?.baseURL
      ?? envFirst(...DEEPSEEK_ENV_BASE_URLS)
    );
  }

  const fromLocal = getLocalProviderConfig(LLM_PROVIDER_ID)?.baseURL;
  if (fromLocal) return fromLocal;
  const fromConfig = resolveLlmConfigProvider(LLM_PROVIDER_ID)?.baseURL;
  if (fromConfig) return fromConfig;
  return envFirst(...GPT55_ENV_BASE_URLS);
}

function resolveModelId(providerId: LlmProviderId): string | undefined {
  if (providerId === CUSTOM_PROVIDER_ID) {
    return (
      getLocalProviderConfig(CUSTOM_PROVIDER_ID)?.model
      ?? envFirst("LLM_CUSTOM_MODEL")
    );
  }
  if (providerId === DEEPSEEK_PROVIDER_ID) {
    const raw =
      getLocalProviderConfig(DEEPSEEK_PROVIDER_ID)?.model
      ?? envFirst(...DEEPSEEK_ENV_MODELS);
    return raw ? resolveDeepSeekModelId(raw) : undefined;
  }

  const fromLocal = getLocalProviderConfig(LLM_PROVIDER_ID)?.model;
  if (fromLocal) return fromLocal;
  const fromConfig = resolveLlmConfigProvider(LLM_PROVIDER_ID)?.model;
  if (fromConfig) return fromConfig;
  return envFirst(...GPT55_ENV_MODELS);
}

export function getLlmProviderId(): LlmProviderId {
  return parseLlmProviderId(process.env.LLM_PROVIDER) ?? LLM_PROVIDER_ID;
}

function hasDirectApiKey(): boolean {
  return Boolean(getLocalDirectApiKey() || process.env.LLM_API_KEY?.trim());
}

function hasConfiguredFallbacks(): boolean {
  return Boolean(
    resolveLlmConfigProvider(LLM_PROVIDER_ID)?.fallbacks?.some((fb) => fb.apiKey),
  );
}

export function isLlmProviderConfigured(providerId: LlmProviderId): boolean {
  if (providerId === CUSTOM_PROVIDER_ID) {
    return Boolean(resolveApiKey(CUSTOM_PROVIDER_ID));
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

function appendFallbackEndpoints(
  providerId: LlmProviderId,
  chain: ResolvedLlmEndpoint[],
): void {
  if (providerId !== LLM_PROVIDER_ID) return;
  const fallbacks = resolveLlmConfigProvider(LLM_PROVIDER_ID)?.fallbacks;
  if (!fallbacks?.length) return;
  const meta = getLlmProviderMeta(providerId);
  for (const fallback of fallbacks) {
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
export function resolveLlmEndpointChain(
  providerOverride?: LlmProviderId,
): ResolvedLlmEndpoint[] {
  const directKey = getLocalDirectApiKey() ?? process.env.LLM_API_KEY?.trim();
  const providerId = providerOverride ?? getLlmProviderId();
  const meta = getLlmProviderMeta(providerId);

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

async function probeLlmEndpoint(endpoint: ResolvedLlmEndpoint): Promise<void> {
  const base = endpoint.baseURL.replace(/\/$/, "");
  const response = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${endpoint.apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(
      `LLM endpoint unavailable (${endpoint.baseURL}): HTTP ${response.status}`,
    );
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

/** Pick the first reachable endpoint (models probe), then build the chat model. */
export async function resolveChatModelForRequest(
  providerOverride?: LlmProviderId,
): Promise<ResolvedChatModel> {
  const chain = resolveLlmEndpointChain(providerOverride);
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
      if (index > 0) {
        console.warn(
          `[llm] using fallback endpoint #${index + 1}: ${endpoint.baseURL}`,
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

/** Run a non-streaming LLM call with endpoint fallback on retryable errors. */
export async function runLlmWithEndpointFallback<T>(
  providerOverride: LlmProviderId | undefined,
  run: (model: LanguageModel, modelId: string) => Promise<T>,
): Promise<{ result: T; modelId: string }> {
  const chain = resolveLlmEndpointChain(providerOverride);
  let lastError: unknown;

  for (let index = 0; index < chain.length; index += 1) {
    const endpoint = chain[index];
    try {
      const model = createChatModelFromEndpoint(endpoint);
      const result = await run(model, endpoint.modelId);
      if (index > 0) {
        console.warn(
          `[llm] using fallback endpoint #${index + 1}: ${endpoint.baseURL}`,
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
