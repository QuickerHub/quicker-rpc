import {
  parseLlmProviderId,
  type LlmProviderId,
} from "@/lib/llm-providers";

export const LLM_PROVIDER_STORAGE_KEY = "agent-gui-llm-provider";

export function loadStoredLlmProvider(): LlmProviderId | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(LLM_PROVIDER_STORAGE_KEY);
    return parseLlmProviderId(raw ?? undefined);
  } catch {
    return undefined;
  }
}

export function storeLlmProvider(id: LlmProviderId): void {
  try {
    localStorage.setItem(LLM_PROVIDER_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
