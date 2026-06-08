import { getBundledEndpoints, loadMergedBuiltinGroupsConfig } from "@/lib/llm-bundled-secrets";
import type { LlmBuiltinSponsor } from "@/lib/llm-builtin-sponsors";
import {
  endpointConfigFingerprint,
  resolveLlmConfigProvider,
  type LlmEndpointConfig,
} from "@/lib/llm-config";
import {
  endpointFingerprint,
  getStickyEndpoint,
  setStickyEndpoint,
} from "@/lib/llm-endpoint-pref";
import {
  getGroupEndpointChain,
  listResolvedLlmEndpointGroups,
  resolveGroupLabel,
  resolveGroupModel,
  type ResolvedLlmEndpointGroup,
} from "@/lib/llm-endpoint-groups";
import {
  LLM_AUTO_DEFAULT_BASE_URL,
  LLM_AUTO_DESCRIPTION,
  LLM_AUTO_GROUP_ID,
  LLM_AUTO_LABEL,
  listAutoModelCandidateIds,
  resolveAutoLlmCredentials,
  resolveAutoModelCandidates,
  selectAutoPreferredModel,
} from "@/lib/llm-auto";
import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import { isLlmProviderConfigured, resolveLlmEndpointChain } from "@/lib/llm";
import { getLocalProviderConfig } from "@/lib/llm-local-secrets";
import {
  formatContextWindow,
  humanizeModelId,
} from "@/lib/model-picker-display";
import {
  CUSTOM_PROVIDER_ID,
  DEEPSEEK_PROVIDER_ID,
  getLlmProviderMeta,
  LLM_PROVIDER_ID,
  resolveDeepSeekModelId,
  type LlmProviderId,
} from "@/lib/llm-providers";

const GPT55_BUILTIN_GROUP_IDS = new Set([
  LLM_PROVIDER_ID,
  "gpt55",
  "gpt-5.5",
  "default",
  "openai",
]);

function resolveGroupPrimaryBaseURL(group: ResolvedLlmEndpointGroup): string {
  const meta = getLlmProviderMeta(group.providerId);

  if (
    group.providerId === LLM_PROVIDER_ID
    && GPT55_BUILTIN_GROUP_IDS.has(group.id)
    && isLlmProviderConfigured(LLM_PROVIDER_ID)
  ) {
    try {
      const resolved = resolveLlmEndpointChain(LLM_PROVIDER_ID)[0]?.baseURL;
      if (resolved) return resolved;
    } catch {
      /* fall through to group endpoint */
    }
  }

  if (
    group.providerId === DEEPSEEK_PROVIDER_ID
    && group.id === DEEPSEEK_PROVIDER_ID
    && isLlmProviderConfigured(DEEPSEEK_PROVIDER_ID)
  ) {
    try {
      const resolved = resolveLlmEndpointChain(DEEPSEEK_PROVIDER_ID)[0]?.baseURL;
      if (resolved) return resolved;
    } catch {
      /* fall through to group endpoint */
    }
  }

  return group.endpoints[0]?.baseURL?.trim() || meta.defaultBaseURL;
}

export type BuiltinGroupEndpointDisplay = {
  id: string;
  baseURL: string;
  model: string;
  selected: boolean;
};

export type BuiltinGroupAutoModelDisplay = {
  id: string;
  modelId: string;
  label: string;
  contextLimit: number;
  contextLimitLabel: string;
  selected: boolean;
  /** 0 = default preferred when nothing is pinned. */
  order: number;
};

export type BuiltinGroupDisplayRow = {
  id: string;
  kind: "builtin" | "auto";
  providerId: LlmProviderId;
  label: string;
  model: string;
  description?: string;
  /** Primary endpoint base URL (dev diagnostics / settings). */
  primaryBaseURL?: string;
  sponsor?: LlmBuiltinSponsor;
  endpointCount: number;
  endpoints: BuiltinGroupEndpointDisplay[];
  autoModels?: BuiltinGroupAutoModelDisplay[];
};

export function isAutoBuiltinGroupId(groupId: string): boolean {
  return groupId === LLM_AUTO_GROUP_ID;
}

function buildAutoModelDisplays(): BuiltinGroupAutoModelDisplay[] {
  const candidates = resolveAutoModelCandidates();
  const selectedId = candidates[0];
  const allIds = listAutoModelCandidateIds();

  return allIds.map((modelId, index) => {
    const { tokens } = resolveModelContextLimit(modelId, CUSTOM_PROVIDER_ID);
    const order = candidates.indexOf(modelId);
    return {
      id: modelId,
      modelId,
      label: humanizeModelId(modelId),
      contextLimit: tokens,
      contextLimitLabel: formatContextWindow(tokens),
      selected: modelId === selectedId,
      order: order === -1 ? index : order,
    };
  }).sort((a, b) => a.order - b.order);
}

function buildAutoGroupDisplayRow(
  group: ResolvedLlmEndpointGroup,
  endpoints: readonly LlmEndpointConfig[],
): BuiltinGroupDisplayRow {
  const credentials = resolveAutoLlmCredentials();
  const baseURL = credentials?.baseURL
    ?? endpoints[0]?.baseURL?.trim()
    ?? LLM_AUTO_DEFAULT_BASE_URL;
  const autoModels = buildAutoModelDisplays();
  const activeModel = autoModels.find((item) => item.selected)?.modelId
    ?? autoModels[0]?.modelId
    ?? group.def.model
    ?? "";

  return {
    id: group.id,
    kind: "auto",
    providerId: group.providerId,
    label: LLM_AUTO_LABEL,
    description: LLM_AUTO_DESCRIPTION,
    model: activeModel,
    primaryBaseURL: baseURL,
    sponsor: group.def.sponsor,
    endpointCount: endpoints.length,
    endpoints: [],
    autoModels,
  };
}

function toBuiltinGroupEndpointDisplays(
  group: ResolvedLlmEndpointGroup,
  endpoints: readonly LlmEndpointConfig[],
): BuiltinGroupEndpointDisplay[] {
  const meta = getLlmProviderMeta(group.providerId);
  const sticky = getStickyEndpoint(group.providerId);
  const stickyKey = sticky ? endpointFingerprint(sticky) : undefined;

  return endpoints.map((endpoint, index) => {
    const id = endpointConfigFingerprint(endpoint);
    const baseURL = endpoint.baseURL?.trim() || meta.defaultBaseURL;
    const rawModel = endpoint.model?.trim() || meta.defaultModel;
    const model = group.providerId === DEEPSEEK_PROVIDER_ID
      ? resolveDeepSeekModelId(rawModel)
      : rawModel;
    return {
      id,
      baseURL,
      model,
      selected: stickyKey ? id === stickyKey : index === 0,
    };
  });
}

export function listBuiltinGroupEndpointDisplays(
  groupId: string,
): BuiltinGroupEndpointDisplay[] {
  const group = resolveBuiltinGroupForProbe(groupId);
  if (!group) return [];
  return toBuiltinGroupEndpointDisplays(
    group,
    resolveGroupProbeEndpoints(group),
  );
}

export function selectBuiltinGroupEndpoint(
  groupId: string,
  endpointId: string,
): boolean {
  const group = resolveBuiltinGroupForProbe(groupId);
  if (!group) return false;

  const meta = getLlmProviderMeta(group.providerId);
  const match = resolveGroupProbeEndpoints(group).find(
    (endpoint) => endpointConfigFingerprint(endpoint) === endpointId,
  );
  if (!match?.apiKey?.trim()) return false;

  setStickyEndpoint(group.providerId, {
    baseURL: match.baseURL?.trim() || meta.defaultBaseURL,
    apiKey: match.apiKey.trim(),
  });
  return true;
}

export function selectBuiltinAutoModel(modelId: string): boolean {
  return selectAutoPreferredModel(modelId);
}

export function listBuiltinGroupDisplayRows(): BuiltinGroupDisplayRow[] {
  const config = loadMergedBuiltinGroupsConfig();
  return listResolvedLlmEndpointGroups(config).map((group) => {
    const endpoints = resolveGroupProbeEndpoints(group);
    if (isAutoBuiltinGroupId(group.id)) {
      return buildAutoGroupDisplayRow(group, endpoints);
    }
    return {
      id: group.id,
      kind: "builtin",
      providerId: group.providerId,
      label: resolveGroupLabel(group.id, group.def, group.endpoints),
      model: resolveGroupModel(group.id, group.def, group.endpoints),
      primaryBaseURL: resolveGroupPrimaryBaseURL(group),
      sponsor: group.def.sponsor,
      endpointCount: endpoints.length,
      endpoints: toBuiltinGroupEndpointDisplays(group, endpoints),
    };
  });
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
