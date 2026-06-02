import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  getLocalDirectApiKey,
  getLocalProviderApiKey,
  getLocalProviderConfig,
} from "@/lib/llm-local-secrets";
import { getBundledProviderApiKey } from "@/lib/llm-bundled-secrets";
import {
  isLlmProviderHidden,
  resolveLlmConfigProvider,
  resolveVisibleDefaultProvider,
} from "@/lib/llm-config";
import {
  getLlmProviderMeta,
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

const ENV_API_KEYS: Record<LlmProviderId, string[]> = {
  zen: ["LLM_ZEN_API_KEY", "OPENCODE_ZEN_API_KEY", "OPENAI_API_KEY"],
  nvidia: ["LLM_NVIDIA_API_KEY"],
  deepseek: ["LLM_DEEPSEEK_API_KEY"],
  chatanywhere: ["LLM_CHATANYWHERE_API_KEY"],
  bingleimuzi: ["LLM_BINGLEIMUZI_API_KEY", "LLM_AI98PRO_API_KEY"],
};

const ENV_BASE_URLS: Record<LlmProviderId, string[]> = {
  zen: ["LLM_ZEN_BASE_URL", "OPENCODE_ZEN_BASE_URL", "OPENAI_BASE_URL"],
  nvidia: ["LLM_NVIDIA_BASE_URL"],
  deepseek: ["LLM_DEEPSEEK_BASE_URL"],
  chatanywhere: ["LLM_CHATANYWHERE_BASE_URL"],
  bingleimuzi: ["LLM_BINGLEIMUZI_BASE_URL", "LLM_AI98PRO_BASE_URL"],
};

const ENV_MODELS: Record<LlmProviderId, string[]> = {
  zen: ["LLM_ZEN_MODEL", "OPENCODE_ZEN_MODEL", "OPENAI_MODEL"],
  nvidia: ["LLM_NVIDIA_MODEL"],
  deepseek: ["LLM_DEEPSEEK_MODEL"],
  chatanywhere: ["LLM_CHATANYWHERE_MODEL"],
  bingleimuzi: ["LLM_BINGLEIMUZI_MODEL", "LLM_AI98PRO_MODEL"],
};

function resolveApiKey(providerId: LlmProviderId): string | undefined {
  const local = getLocalProviderApiKey(providerId);
  if (local) return local;
  const fromConfig = resolveLlmConfigProvider(providerId)?.apiKey;
  if (fromConfig) return fromConfig;
  const bundled = getBundledProviderApiKey(providerId);
  if (bundled) return bundled;
  return envFirst(...ENV_API_KEYS[providerId]);
}

function resolveBaseURL(providerId: LlmProviderId): string | undefined {
  const fromLocal = getLocalProviderConfig(providerId)?.baseURL;
  if (fromLocal) return fromLocal;
  const fromConfig = resolveLlmConfigProvider(providerId)?.baseURL;
  if (fromConfig) return fromConfig;
  return envFirst(...ENV_BASE_URLS[providerId]);
}

function resolveModelId(providerId: LlmProviderId): string | undefined {
  const fromLocal = getLocalProviderConfig(providerId)?.model;
  if (fromLocal) return fromLocal;
  const fromConfig = resolveLlmConfigProvider(providerId)?.model;
  if (fromConfig) return fromConfig;
  return envFirst(...ENV_MODELS[providerId]);
}

export function getLlmProviderId(): LlmProviderId {
  const fromEnv = parseLlmProviderId(process.env.LLM_PROVIDER);
  if (fromEnv && !isLlmProviderHidden(fromEnv)) return fromEnv;
  return resolveVisibleDefaultProvider();
}

function hasDirectApiKey(): boolean {
  return Boolean(getLocalDirectApiKey() || process.env.LLM_API_KEY?.trim());
}

export function isLlmProviderConfigured(providerId: LlmProviderId): boolean {
  if (hasDirectApiKey()) return true;
  return Boolean(resolveApiKey(providerId));
}

export type ResolvedLlmConfig = {
  providerId: LlmProviderId;
  apiKey: string;
  baseURL: string;
  modelId: string;
  clientName: string;
};

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

/**
 * OpenAI-compatible chat endpoint (Zen, NVIDIA integrate, etc.).
 * Uses @ai-sdk/openai-compatible — not @ai-sdk/openai (role mapping differs).
 */
export function resolveLlmConfig(
  providerOverride?: LlmProviderId,
): ResolvedLlmConfig {
  const directKey = getLocalDirectApiKey() ?? process.env.LLM_API_KEY?.trim();
  const providerId = providerOverride ?? getLlmProviderId();
  const meta = getLlmProviderMeta(providerId);

  if (directKey) {
    return {
      providerId,
      apiKey: directKey,
      baseURL: process.env.LLM_BASE_URL?.trim() ?? meta.defaultBaseURL,
      modelId: process.env.LLM_MODEL?.trim() ?? meta.defaultModel,
      clientName: meta.clientName,
    };
  }

  return resolvePreset(providerId);
}

export function resolveChatModel(providerOverride?: LlmProviderId) {
  const { apiKey, baseURL, modelId, clientName } = resolveLlmConfig(
    providerOverride,
  );
  const client = createOpenAICompatible({
    name: clientName,
    baseURL,
    apiKey,
  });
  return client.chatModel(modelId);
}

export function getChatModelId(providerOverride?: LlmProviderId): string {
  return resolveLlmConfig(providerOverride).modelId;
}
