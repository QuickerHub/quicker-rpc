import type { LlmEndpointConfig } from "@/lib/llm-config";
import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import {
  getGroupEndpointChain,
  resolveGroupModel,
} from "@/lib/llm-endpoint-groups";
import type { LlmModelOption } from "@/lib/llm-options-shared";
import { CUSTOM_PROVIDER_ID } from "@/lib/llm-providers";
import { loadMergedPublishGroupsConfig } from "@/lib/llm-publish-config";
import { LLM_AUTO_SELECTION } from "@/lib/llm-selection";

export type AutoLlmEndpoint = {
  apiKey: string;
  baseURL: string;
  modelId: string;
  clientName: string;
};

/** Dev llm-dev.config.json group id for the auto launcher model. */
export const LLM_AUTO_GROUP_ID = "nvidia";

export const LLM_AUTO_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const LLM_AUTO_DEFAULT_MODEL_ID = "openai/gpt-oss-20b";

export const LLM_AUTO_LABEL = "Auto";
export const LLM_AUTO_DESCRIPTION =
  "自动选用轻量模型（当前：NVIDIA NIM GPT-OSS 20B）";

function endpointFromConfig(
  endpoint: LlmEndpointConfig,
  modelId: string,
): AutoLlmEndpoint {
  return {
    apiKey: endpoint.apiKey.trim(),
    baseURL: endpoint.baseURL?.trim() || LLM_AUTO_DEFAULT_BASE_URL,
    modelId,
    clientName: "llm-auto-nvidia",
  };
}

function resolveAutoFromGroupsConfig(): AutoLlmEndpoint | undefined {
  const config = loadMergedPublishGroupsConfig();
  const chain = getGroupEndpointChain(config, LLM_AUTO_GROUP_ID);
  const endpoint = chain[0];
  if (!endpoint?.apiKey?.trim()) return undefined;

  const groupDef = config.groups.get(LLM_AUTO_GROUP_ID);
  const modelId =
    endpoint.model?.trim()
    ?? (groupDef ? resolveGroupModel(LLM_AUTO_GROUP_ID, groupDef, chain) : undefined)
    ?? LLM_AUTO_DEFAULT_MODEL_ID;

  return endpointFromConfig(endpoint, modelId);
}

function resolveAutoFromEnv(): AutoLlmEndpoint | undefined {
  const apiKey =
    process.env.LLM_AUTO_API_KEY?.trim()
    ?? process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) return undefined;

  return {
    apiKey,
    baseURL:
      process.env.LLM_AUTO_BASE_URL?.trim() || LLM_AUTO_DEFAULT_BASE_URL,
    modelId:
      process.env.LLM_AUTO_MODEL?.trim() || LLM_AUTO_DEFAULT_MODEL_ID,
    clientName: "llm-auto-nvidia",
  };
}

export function resolveAutoLlmEndpoint(): AutoLlmEndpoint | undefined {
  return resolveAutoFromGroupsConfig() ?? resolveAutoFromEnv();
}

export function isAutoLlmConfigured(): boolean {
  return Boolean(resolveAutoLlmEndpoint());
}

export function buildAutoModelOption(): LlmModelOption | undefined {
  const endpoint = resolveAutoLlmEndpoint();
  if (!endpoint) return undefined;

  const { tokens, source } = resolveModelContextLimit(
    endpoint.modelId,
    CUSTOM_PROVIDER_ID,
  );

  return {
    selection: LLM_AUTO_SELECTION,
    kind: "auto",
    label: LLM_AUTO_LABEL,
    description: LLM_AUTO_DESCRIPTION,
    modelId: endpoint.modelId,
    configured: true,
    contextLimit: tokens,
    contextLimitSource: source,
  };
}
