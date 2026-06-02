/** Client-safe LLM provider metadata (no secrets). */

export const LLM_PROVIDER_ID = "bingleimuzi" as const;
export const DEEPSEEK_PROVIDER_ID = "deepseek" as const;

export type LlmProviderId = typeof LLM_PROVIDER_ID | typeof DEEPSEEK_PROVIDER_ID;

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

/** DeepSeek official API default (V4 Flash; replaces deprecated deepseek-chat). */
export const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash" as const;

const DEEPSEEK_LEGACY_MODEL_IDS = new Set([
  "deepseek-chat",
  "deepseek-reasoner",
]);

export const DEEPSEEK_PROVIDER: LlmProviderMeta = {
  id: DEEPSEEK_PROVIDER_ID,
  label: "DeepSeek",
  defaultBaseURL: "https://api.deepseek.com/v1",
  defaultModel: DEEPSEEK_DEFAULT_MODEL,
  clientName: "deepseek-official",
  description: "DeepSeek 官方 API（默认 deepseek-v4-flash，需在设置中填写 Key）",
};

/** Map legacy DeepSeek model ids to the current default. */
export function resolveDeepSeekModelId(modelId: string | undefined): string {
  const trimmed = modelId?.trim();
  if (!trimmed) return DEEPSEEK_DEFAULT_MODEL;
  if (DEEPSEEK_LEGACY_MODEL_IDS.has(trimmed.toLowerCase())) {
    return DEEPSEEK_DEFAULT_MODEL;
  }
  return trimmed;
}

export const LLM_PROVIDER_LIST: readonly LlmProviderMeta[] = [
  GPT55_PROVIDER,
  DEEPSEEK_PROVIDER,
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
