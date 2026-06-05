import { getBundledEndpoints, loadMergedBuiltinGroupsConfig } from "@/lib/llm-bundled-secrets";
import type { LlmBuiltinSponsor } from "@/lib/llm-builtin-sponsors";
import { resolveLlmConfigProvider, type LlmEndpointConfig } from "@/lib/llm-config";
import {
  getGroupEndpointChain,
  listResolvedLlmEndpointGroups,
  resolveGroupLabel,
  resolveGroupModel,
  type ResolvedLlmEndpointGroup,
} from "@/lib/llm-endpoint-groups";
import { getLocalProviderConfig } from "@/lib/llm-local-secrets";
import {
  DEEPSEEK_PROVIDER_ID,
  getLlmProviderMeta,
  LLM_PROVIDER_ID,
  resolveDeepSeekModelId,
  type LlmProviderId,
} from "@/lib/llm-providers";

export type BuiltinGroupDisplayRow = {
  id: string;
  providerId: LlmProviderId;
  label: string;
  model: string;
  sponsor?: LlmBuiltinSponsor;
  endpointCount: number;
};

export function listBuiltinGroupDisplayRows(): BuiltinGroupDisplayRow[] {
  const config = loadMergedBuiltinGroupsConfig();
  return listResolvedLlmEndpointGroups(config).map((group) => ({
    id: group.id,
    providerId: group.providerId,
    label: resolveGroupLabel(group.id, group.def, group.endpoints),
    model: resolveGroupModel(group.id, group.def, group.endpoints),
    sponsor: group.def.sponsor,
    endpointCount: group.endpoints.length,
  }));
}

export function resolveBuiltinGroupForProbe(
  groupId: string,
): ResolvedLlmEndpointGroup | undefined {
  const config = loadMergedBuiltinGroupsConfig();
  const group = listResolvedLlmEndpointGroups(config).find((item) => item.id === groupId);
  if (!group) return undefined;
  return {
    ...group,
    endpoints: getGroupEndpointChain(config, groupId),
  };
}

export function resolveMergedBuiltinDisplayModel(
  providerId: LlmProviderId,
): string {
  const meta = getLlmProviderMeta(providerId);
  const localModel = getLocalProviderConfig(providerId)?.model?.trim();
  if (localModel) {
    return providerId === DEEPSEEK_PROVIDER_ID
      ? resolveDeepSeekModelId(localModel)
      : localModel;
  }

  if (providerId === LLM_PROVIDER_ID) {
    const fromConfig = resolveLlmConfigProvider(providerId)?.model?.trim();
    if (fromConfig) return fromConfig;
  }

  const config = loadMergedBuiltinGroupsConfig();
  const group = listResolvedLlmEndpointGroups(config).find(
    (item) => item.providerId === providerId,
  );
  if (group) {
    return resolveGroupModel(group.id, group.def, group.endpoints);
  }

  const bundled = getBundledEndpoints(providerId);
  if (bundled[0]?.model?.trim()) {
    const raw = bundled[0].model.trim();
    return providerId === DEEPSEEK_PROVIDER_ID
      ? resolveDeepSeekModelId(raw)
      : raw;
  }

  return meta.defaultModel;
}

export function resolveGroupProbeEndpoints(
  group: ResolvedLlmEndpointGroup,
): LlmEndpointConfig[] {
  return group.endpoints.filter((endpoint) => endpoint.apiKey?.trim());
}
