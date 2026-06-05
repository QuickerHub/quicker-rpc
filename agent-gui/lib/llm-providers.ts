/** Client-safe LLM provider metadata (no secrets). */

export const LLM_PROVIDER_ID = "bingleimuzi" as const;
export const DEEPSEEK_PROVIDER_ID = "deepseek" as const;
export const CUSTOM_PROVIDER_ID = "custom" as const;

export type LlmProviderId =
  | typeof LLM_PROVIDER_ID
  | typeof DEEPSEEK_PROVIDER_ID
  | typeof CUSTOM_PROVIDER_ID;

export type LlmProviderMeta = {
  id: LlmProviderId;
  /** Toolbar button / menu title */
  label: string;
  defaultBaseURL: string;
  defaultModel: string;
  clientName: string;
  description: string;
};

export const GPT55_PROVIDER: LlmProviderMeta = {
  id: LLM_PROVIDER_ID,
  label: "OpenAI",
  defaultBaseURL: "https://api.bingleimuzi.eu.cc/v1",
  defaultModel: "gpt-5.5",
  clientName: "gpt-5.5",
  description: "默认对话模型 gpt-5.5（内置 endpoint fallback）",
};

/** DeepSeek built-in default (V4 Pro via bundled endpoint). */
export const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-pro" as const;

export const DEEPSEEK_MODEL_IDS = [
  "deepseek-v4-flash",
  "deepseek-v4-pro",
] as const;

export type DeepSeekModelId = (typeof DEEPSEEK_MODEL_IDS)[number];

/** Selectable DeepSeek models in settings. */
export const DEEPSEEK_MODEL_OPTIONS: readonly { id: DeepSeekModelId; label: string }[] = [
  { id: "deepseek-v4-flash", label: "V4 Flash" },
  { id: "deepseek-v4-pro", label: "V4 Pro" },
];

const DEEPSEEK_LEGACY_MODEL_IDS = new Set([
  "deepseek-chat",
  "deepseek-reasoner",
]);

const DEEPSEEK_KNOWN_MODEL_IDS = new Set<string>(DEEPSEEK_MODEL_IDS);

export function isKnownDeepSeekModelId(modelId: string): boolean {
  return DEEPSEEK_KNOWN_MODEL_IDS.has(modelId.trim().toLowerCase());
}

export const DEEPSEEK_PROVIDER: LlmProviderMeta = {
  id: DEEPSEEK_PROVIDER_ID,
  label: "DeepSeek",
  defaultBaseURL: "https://api.bingleimuzi.eu.cc/v1",
  defaultModel: DEEPSEEK_DEFAULT_MODEL,
  clientName: "deepseek-official",
  description: "默认 DeepSeek V4 Pro（内置 endpoint，免配置 Key）",
};

export const CUSTOM_PROVIDER: LlmProviderMeta = {
  id: CUSTOM_PROVIDER_ID,
  label: "Custom",
  defaultBaseURL: "https://api.openai.com/v1",
  defaultModel: "gpt-4o-mini",
  clientName: "custom-openai-compatible",
  description: "自定义 OpenAI-compatible 模型（可配置 Model / Base URL / API Key）",
};

/** Map legacy DeepSeek model ids to the current default. */
export function resolveDeepSeekModelId(modelId: string | undefined): string {
  const trimmed = modelId?.trim();
  if (!trimmed) return DEEPSEEK_DEFAULT_MODEL;
  const lower = trimmed.toLowerCase();
  if (DEEPSEEK_LEGACY_MODEL_IDS.has(lower)) {
    return DEEPSEEK_DEFAULT_MODEL;
  }
  if (DEEPSEEK_KNOWN_MODEL_IDS.has(lower)) {
    return lower;
  }
  return trimmed;
}

export const LLM_PROVIDER_LIST: readonly LlmProviderMeta[] = [
  GPT55_PROVIDER,
  DEEPSEEK_PROVIDER,
  CUSTOM_PROVIDER,
] as const;

const GPT55_ALIASES = new Set([
  "bingleimuzi",
  "default",
  "gpt-5.5",
  "gpt55",
  "ai98pro",
]);

export function parseLlmProviderId(raw: string | undefined): LlmProviderId | undefined {
  if (!raw?.trim()) return LLM_PROVIDER_ID;
  const id = raw.trim().toLowerCase();
  if (id === CUSTOM_PROVIDER_ID) return CUSTOM_PROVIDER_ID;
  if (id === DEEPSEEK_PROVIDER_ID) return DEEPSEEK_PROVIDER_ID;
  if (GPT55_ALIASES.has(id)) return LLM_PROVIDER_ID;
  return undefined;
}

export function getLlmProviderMeta(id: LlmProviderId = LLM_PROVIDER_ID): LlmProviderMeta {
  const meta = LLM_PROVIDER_LIST.find((p) => p.id === id);
  if (!meta) throw new Error(`Unknown LLM provider: ${id}`);
  return meta;
}

/** Short label for composer toolbar (model id tail). */
export function formatModelShortLabel(modelId: string): string {
  const tail = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  if (tail.length <= 14) return tail;
  return `${tail.slice(0, 12)}…`;
}
