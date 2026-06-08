import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import {
  getGroupEndpointChain,
  resolveGroupModel,
} from "@/lib/llm-endpoint-groups";
import type { LlmModelOption } from "@/lib/llm-options-shared";
import { CUSTOM_PROVIDER_ID } from "@/lib/llm-providers";
import { loadMergedBuiltinGroupsConfig } from "@/lib/llm-bundled-secrets";
import {
  getStickyAutoModel,
  setStickyAutoModel,
} from "@/lib/llm-endpoint-pref";
import { LLM_AUTO_SELECTION } from "@/lib/llm-selection";
import {
  LLM_AUTO_MODEL_CANDIDATES,
  mergeAutoModelCandidates,
  reorderAutoModelCandidates,
} from "@/lib/llm-auto-candidates";

export type AutoLlmEndpoint = {
  apiKey: string;
  baseURL: string;
  modelId: string;
  clientName: string;
};

export type AutoLlmCredentials = {
  apiKey: string;
  baseURL: string;
  clientName: string;
};

/** Dev llm-dev.config.json group id for the auto launcher model. */
export const LLM_AUTO_GROUP_ID = "nvidia";

export const LLM_AUTO_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const LLM_AUTO_DEFAULT_MODEL_ID = LLM_AUTO_MODEL_CANDIDATES[0];

export const LLM_AUTO_LABEL = "Auto";
export const LLM_AUTO_DESCRIPTION =
  "自动在 NVIDIA NIM 候选模型间切换（首选 Qwen3 Coder 480B）";

export { LLM_AUTO_MODEL_CANDIDATES };

/** Runtime fallback after a successful chat probe (not persisted). */
let runtimeStickyAutoModelId: string | undefined;

function resolveAutoCredentialsFromGroupsConfig(): AutoLlmCredentials | undefined {
  const config = loadMergedBuiltinGroupsConfig();
  const chain = getGroupEndpointChain(config, LLM_AUTO_GROUP_ID);
  const endpoint = chain[0];
  if (!endpoint?.apiKey?.trim()) return undefined;
  return {
    apiKey: endpoint.apiKey.trim(),
    baseURL: endpoint.baseURL?.trim() || LLM_AUTO_DEFAULT_BASE_URL,
    clientName: "llm-auto-nvidia",
  };
}

function resolveAutoCredentialsFromEnv(): AutoLlmCredentials | undefined {
  const apiKey =
    process.env.LLM_AUTO_API_KEY?.trim()
    ?? process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) return undefined;

  return {
    apiKey,
    baseURL:
      process.env.LLM_AUTO_BASE_URL?.trim() || LLM_AUTO_DEFAULT_BASE_URL,
    clientName: "llm-auto-nvidia",
  };
}

export function resolveAutoLlmCredentials(): AutoLlmCredentials | undefined {
  return resolveAutoCredentialsFromGroupsConfig()
    ?? resolveAutoCredentialsFromEnv();
}

function resolveConfiguredAutoModels(): string[] | undefined {
  const config = loadMergedBuiltinGroupsConfig();
  const def = config.groups.get(LLM_AUTO_GROUP_ID);
  const models = def?.autoModels;
  return models?.length ? models : undefined;
}

function resolveAutoPrimaryModel(): string | undefined {
  const config = loadMergedBuiltinGroupsConfig();
  const chain = getGroupEndpointChain(config, LLM_AUTO_GROUP_ID);
  const endpoint = chain[0];
  const groupDef = config.groups.get(LLM_AUTO_GROUP_ID);
  return endpoint?.model?.trim()
    ?? (groupDef ? resolveGroupModel(LLM_AUTO_GROUP_ID, groupDef, chain) : undefined)
    ?? LLM_AUTO_DEFAULT_MODEL_ID;
}

export function resolveAutoModelCandidates(): string[] {
  const merged = mergeAutoModelCandidates({
    envModel: process.env.LLM_AUTO_MODEL?.trim(),
    primary: resolveAutoPrimaryModel(),
    configured: resolveConfiguredAutoModels(),
  });
  return reorderAutoModelCandidates(
    merged,
    getStickyAutoModel() ?? runtimeStickyAutoModelId,
  );
}

export function listAutoModelCandidateIds(): string[] {
  return mergeAutoModelCandidates({
    envModel: process.env.LLM_AUTO_MODEL?.trim(),
    primary: resolveAutoPrimaryModel(),
    configured: resolveConfiguredAutoModels(),
  });
}

export function selectAutoPreferredModel(modelId: string): boolean {
  const normalized = modelId.trim();
  if (!normalized) return false;
  const allowed = listAutoModelCandidateIds();
  if (!allowed.includes(normalized)) return false;
  setStickyAutoModel(normalized);
  runtimeStickyAutoModelId = normalized;
  return true;
}

export function buildAutoLlmEndpointChain(): AutoLlmEndpoint[] {
  const credentials = resolveAutoLlmCredentials();
  if (!credentials) return [];

  return resolveAutoModelCandidates().map((modelId) => ({
    ...credentials,
    modelId,
  }));
}

export function rememberSuccessfulAutoModel(modelId: string): void {
  const normalized = modelId.trim();
  if (!normalized) return;
  runtimeStickyAutoModelId = normalized;
}

export function resolveAutoLlmEndpoint(): AutoLlmEndpoint | undefined {
  return buildAutoLlmEndpointChain()[0];
}

export function isAutoLlmConfigured(): boolean {
  return Boolean(resolveAutoLlmCredentials());
}

export function buildAutoModelOption(): LlmModelOption | undefined {
  const candidates = resolveAutoModelCandidates();
  const modelId = candidates[0];
  if (!modelId || !resolveAutoLlmCredentials()) return undefined;

  const { tokens, source } = resolveModelContextLimit(
    modelId,
    CUSTOM_PROVIDER_ID,
  );

  const fallbackHint = candidates.length > 1
    ? `，备选 ${candidates.length - 1} 个`
    : "";

  return {
    selection: LLM_AUTO_SELECTION,
    kind: "auto",
    label: LLM_AUTO_LABEL,
    description: `${LLM_AUTO_DESCRIPTION}${fallbackHint}`,
    modelId,
    configured: true,
    baseURL: resolveAutoLlmEndpoint()?.baseURL,
    contextLimit: tokens,
    contextLimitSource: source,
  };
}
