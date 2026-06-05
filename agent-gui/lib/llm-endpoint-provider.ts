import type { LlmEndpointConfig } from "@/lib/llm-config";
import {
  DEEPSEEK_PROVIDER_ID,
  LLM_PROVIDER_ID,
  type LlmProviderId,
} from "@/lib/llm-providers";

/** Infer built-in provider from publish/bundled endpoint model id. */
export function inferPublishEndpointProvider(
  endpoint: LlmEndpointConfig,
): LlmProviderId {
  const model = endpoint.model?.trim().toLowerCase() ?? "";
  if (model.startsWith("deepseek")) return DEEPSEEK_PROVIDER_ID;
  return LLM_PROVIDER_ID;
}

export function filterEndpointsForProvider(
  endpoints: readonly LlmEndpointConfig[],
  providerId: LlmProviderId,
): LlmEndpointConfig[] {
  return endpoints.filter(
    (endpoint) => inferPublishEndpointProvider(endpoint) === providerId,
  );
}
