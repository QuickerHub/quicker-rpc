import { getLocalDirectApiKey, getLocalProviderApiKey } from "@/lib/llm-local-secrets";
import {
  CUSTOM_PROVIDER_ID,
  DEEPSEEK_PROVIDER_ID,
  LLM_PROVIDER_ID,
  type LlmProviderId,
} from "@/lib/llm-providers";
import type { LlmSelection } from "@/lib/llm-selection";

const TRACKED_BUILTIN_PROVIDERS = new Set<LlmProviderId>([
  LLM_PROVIDER_ID,
  DEEPSEEK_PROVIDER_ID,
]);

function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function hasUserKeyOverride(providerId: LlmProviderId): boolean {
  if (getLocalProviderApiKey(providerId)) return true;

  if (providerId === LLM_PROVIDER_ID) {
    if (getLocalDirectApiKey()) return true;
    if (envFirst("LLM_API_KEY", "LLM_BINGLEIMUZI_API_KEY", "LLM_AI98PRO_API_KEY")) {
      return true;
    }
  }

  if (providerId === DEEPSEEK_PROVIDER_ID) {
    if (envFirst("LLM_DEEPSEEK_API_KEY")) return true;
  }

  return false;
}

/** Managed bundled keys (publish/admin pool), not user-supplied API key overrides. */
export function shouldTrackManagedLlmUsage(selection: LlmSelection): boolean {
  if (selection.kind !== "builtin") return false;
  if (selection.providerId === CUSTOM_PROVIDER_ID) return false;
  if (!TRACKED_BUILTIN_PROVIDERS.has(selection.providerId)) return false;
  return !hasUserKeyOverride(selection.providerId);
}
