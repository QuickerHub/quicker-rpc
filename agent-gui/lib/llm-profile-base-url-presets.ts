/** Common OpenAI-compatible base URLs for custom LLM profiles (client-safe). */

export type LlmBaseUrlPreset = {
  id: string;
  label: string;
  baseURL: string;
};

export const CUSTOM_BASE_URL_PRESET_ID = "__custom__";

export const LLM_PROFILE_BASE_URL_PRESETS: readonly LlmBaseUrlPreset[] = [
  {
    id: "openai",
    label: "OpenAI 官方",
    baseURL: "https://api.openai.com/v1",
  },
  {
    id: "deepseek",
    label: "DeepSeek 官方",
    baseURL: "https://api.deepseek.com/v1",
  },
  {
    id: "moonshot",
    label: "Moonshot / Kimi",
    baseURL: "https://api.moonshot.cn/v1",
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
  },
  {
    id: "dashscope",
    label: "阿里云百炼 / Qwen",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    baseURL: "https://api.siliconflow.cn/v1",
  },
  {
    id: "chatanywhere",
    label: "ChatAnywhere",
    baseURL: "https://api.chatanywhere.tech/v1",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
  },
  {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
  },
  {
    id: "together",
    label: "Together AI",
    baseURL: "https://api.together.xyz/v1",
  },
  {
    id: "mistral",
    label: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    baseURL: "https://integrate.api.nvidia.com/v1",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    baseURL: "https://api.x.ai/v1",
  },
  {
    id: "ollama",
    label: "Ollama 本地",
    baseURL: "http://127.0.0.1:11434/v1",
  },
  {
    id: "lmstudio",
    label: "LM Studio 本地",
    baseURL: "http://127.0.0.1:1234/v1",
  },
  {
    id: "vllm",
    label: "vLLM / 自建网关",
    baseURL: "http://127.0.0.1:8000/v1",
  },
] as const;

export function normalizeBaseUrlForMatch(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function findBaseUrlPreset(baseURL: string): LlmBaseUrlPreset | undefined {
  const normalized = normalizeBaseUrlForMatch(baseURL);
  if (!normalized) return undefined;
  return LLM_PROFILE_BASE_URL_PRESETS.find(
    (preset) => normalizeBaseUrlForMatch(preset.baseURL) === normalized,
  );
}
