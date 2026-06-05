import { getLocalDirectApiKey, getLocalProviderApiKey } from "@/lib/llm-local-secrets";
import { LLM_PROVIDER_ID } from "@/lib/llm-providers";
import type { LlmSelection } from "@/lib/llm-selection";

/** Managed GPT-5.5 pool (bundled/admin keys), not the user's own API key override. */
export function shouldTrackManagedLlmUsage(selection: LlmSelection): boolean {
  if (selection.kind !== "builtin" || selection.providerId !== LLM_PROVIDER_ID) {
    return false;
  }
  if (getLocalProviderApiKey(LLM_PROVIDER_ID)) return false;
  if (getLocalDirectApiKey()) return false;
  if (process.env.LLM_API_KEY?.trim()) return false;
  return true;
}
