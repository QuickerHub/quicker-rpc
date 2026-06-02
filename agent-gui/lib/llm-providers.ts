/** Client-safe LLM provider metadata (no secrets). */

export type LlmProviderId =
  | "zen"
  | "nvidia"
  | "deepseek"
  | "chatanywhere"
  | "ai98pro";

export type LlmProviderMeta = {
  id: LlmProviderId;
  /** Toolbar button / menu title */
  label: string;
  defaultBaseURL: string;
  defaultModel: string;
  clientName: string;
  description: string;
};

export const LLM_PROVIDER_LIST: readonly LlmProviderMeta[] = [
  {
    id: "zen",
    label: "OpenCode Zen",
    defaultBaseURL: "https://opencode.ai/zen/v1",
    defaultModel: "deepseek-v4-flash-free",
    clientName: "opencode-zen",
    description: "DeepSeek 等（opencode.ai/zen）",
  },
  {
    id: "nvidia",
    label: "NVIDIA GLM",
    defaultBaseURL: "https://integrate.api.nvidia.com/v1",
    defaultModel: "z-ai/glm-5.1",
    clientName: "nvidia-integrate",
    description: "build.nvidia.com integrate API（GLM）",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    defaultBaseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-v4-flash",
    clientName: "deepseek-official",
    description: "DeepSeek 官方 API（需自备 Key）",
  },
  {
    id: "chatanywhere",
    label: "ChatAnywhere",
    defaultBaseURL: "https://api.chatanywhere.tech/v1",
    defaultModel: "gpt-5.5",
    clientName: "chatanywhere",
    description: "OpenAI 兼容转发（api.chatanywhere.tech）",
  },
  {
    id: "ai98pro",
    label: "GPT-5.5",
    defaultBaseURL: "https://ai98pro.xyz/v1",
    defaultModel: "gpt-5.5",
    clientName: "ai98pro",
    description: "默认对话模型",
  },
] as const;

export function parseLlmProviderId(raw: string | undefined): LlmProviderId | undefined {
  const id = raw?.trim().toLowerCase();
  if (
    id === "nvidia"
    || id === "zen"
    || id === "deepseek"
    || id === "chatanywhere"
    || id === "ai98pro"
  ) {
    return id;
  }
  return undefined;
}

export function getLlmProviderMeta(id: LlmProviderId): LlmProviderMeta {
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
