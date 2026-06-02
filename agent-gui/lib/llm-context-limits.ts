import type { LlmProviderId } from "@/lib/llm-providers";

export type ContextLimitSource = "env" | "catalog" | "pattern" | "default";

export type ResolvedContextLimit = {
  tokens: number;
  source: ContextLimitSource;
};

/** Fallback when model is unknown. */
export const DEFAULT_MODEL_CONTEXT_TOKENS = 128_000;

/**
 * Exact model id → max context tokens (input + output budget for the API).
 * Keys are lowercased; lookup normalizes vendor prefixes (e.g. z-ai/glm-5.1).
 */
const EXACT_CONTEXT_TOKENS: Readonly<Record<string, number>> = {
  // DeepSeek official
  "deepseek-chat": 64_000,
  "deepseek-reasoner": 64_000,
  "deepseek-v4-flash": 128_000,
  "deepseek-v4-flash-free": 128_000,

  // OpenCode Zen (common routed ids)
  "deepseek-v4": 128_000,

  // NVIDIA integrate / Zhipu
  "z-ai/glm-5.1": 128_000,
  "z-ai/glm-5": 128_000,
  "glm-5.1": 128_000,
  "glm-5": 128_000,
  "glm-4-plus": 128_000,
  "glm-4-air": 128_000,
  "glm-4-flash": 128_000,
  "glm-4.6": 200_000,

  // Common OpenAI-compatible ids on integrate
  "meta/llama-3.1-70b-instruct": 128_000,
  "meta/llama-3.1-8b-instruct": 128_000,

  // ChatAnywhere / OpenAI
  "gpt-5.5": 272_000,
  "gpt-5.1": 128_000,
  "gpt-5": 128_000,
  "gpt-4.1": 128_000,
  "gpt-4o": 128_000,
};

/** Longest match first. */
const PATTERN_CONTEXT_TOKENS: ReadonlyArray<{ pattern: RegExp; tokens: number }> = [
  { pattern: /deepseek.*reasoner/i, tokens: 64_000 },
  { pattern: /deepseek.*chat/i, tokens: 64_000 },
  { pattern: /deepseek.*flash/i, tokens: 128_000 },
  { pattern: /deepseek/i, tokens: 128_000 },
  { pattern: /glm-4\.6|glm4\.6/i, tokens: 200_000 },
  { pattern: /glm-5|glm5/i, tokens: 128_000 },
  { pattern: /glm-4|glm4/i, tokens: 128_000 },
  { pattern: /llama-3\.1|llama3\.1/i, tokens: 128_000 },
  { pattern: /gpt-5\.5|gpt5\.5/i, tokens: 272_000 },
  { pattern: /gpt-5|gpt5/i, tokens: 128_000 },
  { pattern: /gpt-4|gpt4/i, tokens: 128_000 },
];

function normalizeModelKey(modelId: string): string {
  return modelId.trim().toLowerCase();
}

function readEnvContextLimit(): number | undefined {
  const raw =
    process.env.CONTEXT_LIMIT?.trim()
    ?? process.env.NEXT_PUBLIC_CONTEXT_LIMIT?.trim();
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Global override from server or public env (applies to all models). */
export function resolveEnvContextLimit(): number | undefined {
  return readEnvContextLimit();
}

/**
 * Resolve max context tokens for a model id.
 * Optional providerId reserved for future provider-specific tables.
 */
export function resolveModelContextLimit(
  modelId: string,
  _providerId?: LlmProviderId,
): ResolvedContextLimit {
  const envLimit = resolveEnvContextLimit();
  if (envLimit !== undefined) {
    return { tokens: envLimit, source: "env" };
  }

  const key = normalizeModelKey(modelId);
  if (!key) {
    return { tokens: DEFAULT_MODEL_CONTEXT_TOKENS, source: "default" };
  }

  const exact = EXACT_CONTEXT_TOKENS[key];
  if (exact !== undefined) {
    return { tokens: exact, source: "catalog" };
  }

  for (const { pattern, tokens } of PATTERN_CONTEXT_TOKENS) {
    if (pattern.test(key)) {
      return { tokens, source: "pattern" };
    }
  }

  return { tokens: DEFAULT_MODEL_CONTEXT_TOKENS, source: "default" };
}
