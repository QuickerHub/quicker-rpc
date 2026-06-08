import {
  normalizeBuiltinSponsor,
  parseBuiltinSponsorsMap,
  type LlmBuiltinSponsor,
} from "@/lib/llm-builtin-sponsors";
import {
  dedupeEndpointConfigs,
  type LlmEndpointConfig,
} from "@/lib/llm-config";
import { inferPublishEndpointProvider } from "@/lib/llm-endpoint-provider";
import {
  DEEPSEEK_PROVIDER_ID,
  getLlmProviderMeta,
  LLM_PROVIDER_ID,
  resolveDeepSeekModelId,
  type LlmProviderId,
} from "@/lib/llm-providers";

export type LlmEndpointGroupDef = {
  label?: string;
  model?: string;
  /** Ordered fallback model ids for Auto when this group backs the launcher. */
  autoModels?: string[];
  sponsor?: LlmBuiltinSponsor;
};

export type LlmEndpointGroupsConfig = {
  groups: Map<string, LlmEndpointGroupDef>;
  endpointsByGroup: Map<string, LlmEndpointConfig[]>;
};

export type ResolvedLlmEndpointGroup = {
  id: string;
  providerId: LlmProviderId;
  def: LlmEndpointGroupDef;
  endpoints: LlmEndpointConfig[];
};

const BUILTIN_GROUP_ORDER = [LLM_PROVIDER_ID, DEEPSEEK_PROVIDER_ID] as const;

const GPT55_GROUP_IDS = new Set([
  LLM_PROVIDER_ID,
  "gpt55",
  "gpt-5.5",
  "default",
  "openai",
]);

function normalizeEndpoint(raw: unknown): LlmEndpointConfig | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as LlmEndpointConfig & Record<string, unknown>;
  const apiKey = typeof data.apiKey === "string" ? data.apiKey.trim() : "";
  if (!apiKey) return undefined;
  const next: LlmEndpointConfig = { apiKey };
  if (typeof data.baseURL === "string" && data.baseURL.trim()) {
    next.baseURL = data.baseURL.trim();
  }
  if (typeof data.model === "string" && data.model.trim()) {
    next.model = data.model.trim();
  }
  if (typeof data.group === "string" && data.group.trim()) {
    next.group = data.group.trim();
  }
  return next;
}

function normalizeGroupDef(raw: unknown): LlmEndpointGroupDef | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as Record<string, unknown>;
  const def: LlmEndpointGroupDef = {};
  if (typeof data.label === "string" && data.label.trim()) {
    def.label = data.label.trim();
  }
  if (typeof data.model === "string" && data.model.trim()) {
    def.model = data.model.trim();
  }
  if (Array.isArray(data.autoModels)) {
    const autoModels = data.autoModels
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (autoModels.length > 0) def.autoModels = autoModels;
  }
  const sponsor = normalizeBuiltinSponsor(data.sponsor);
  if (sponsor) def.sponsor = sponsor;
  return def;
}

export function defaultGroupIdForProvider(providerId: LlmProviderId): string {
  return providerId === LLM_PROVIDER_ID ? "gpt55" : providerId;
}

export function inferProviderFromGroupId(
  groupId: string,
): LlmProviderId | undefined {
  const id = groupId.trim().toLowerCase();
  if (id === DEEPSEEK_PROVIDER_ID) return DEEPSEEK_PROVIDER_ID;
  if (GPT55_GROUP_IDS.has(id)) return LLM_PROVIDER_ID;
  return undefined;
}

export function resolveGroupProvider(
  groupId: string,
  endpoints: readonly LlmEndpointConfig[],
): LlmProviderId {
  return inferProviderFromGroupId(groupId)
    ?? (endpoints[0] ? inferPublishEndpointProvider(endpoints[0]) : LLM_PROVIDER_ID);
}

function resolveEndpointGroupId(endpoint: LlmEndpointConfig): string {
  if (endpoint.group?.trim()) return endpoint.group.trim();
  const providerId = inferPublishEndpointProvider(endpoint);
  return defaultGroupIdForProvider(providerId);
}

function ensureGroupDef(
  groups: Map<string, LlmEndpointGroupDef>,
  groupId: string,
  endpoint: LlmEndpointConfig,
): LlmEndpointGroupDef {
  const existing = groups.get(groupId);
  if (existing) return existing;

  const providerId = resolveGroupProvider(groupId, [endpoint]);
  const meta = getLlmProviderMeta(providerId);
  const def: LlmEndpointGroupDef = {
    label: inferProviderFromGroupId(groupId) ? meta.label : groupId,
    model: endpoint.model ?? meta.defaultModel,
  };
  groups.set(groupId, def);
  return def;
}

function appendGroupEndpoint(
  endpointsByGroup: Map<string, LlmEndpointConfig[]>,
  groupId: string,
  endpoint: LlmEndpointConfig,
): void {
  const list = endpointsByGroup.get(groupId) ?? [];
  list.push(endpoint);
  endpointsByGroup.set(groupId, list);
}

/** Parse llm-*-config.json with optional `groups` + `group` on endpoints. */
export function parseLlmEndpointGroupsConfig(raw: unknown): LlmEndpointGroupsConfig {
  const groups = new Map<string, LlmEndpointGroupDef>();
  const endpointsByGroup = new Map<string, LlmEndpointConfig[]>();

  if (typeof raw !== "object" || raw === null) {
    return { groups, endpointsByGroup };
  }

  const data = raw as Record<string, unknown>;
  const groupsRaw = data.groups;
  if (typeof groupsRaw === "object" && groupsRaw !== null) {
    for (const [groupId, defRaw] of Object.entries(
      groupsRaw as Record<string, unknown>,
    )) {
      const id = groupId.trim();
      if (!id) continue;
      const def = normalizeGroupDef(defRaw);
      if (def) groups.set(id, def);
    }
  }

  const legacySponsors = parseBuiltinSponsorsMap(raw);
  for (const providerId of BUILTIN_GROUP_ORDER) {
    const sponsor = legacySponsors[providerId];
    if (!sponsor) continue;
    const groupId = defaultGroupIdForProvider(providerId);
    const prev = groups.get(groupId);
    groups.set(groupId, {
      label: prev?.label ?? getLlmProviderMeta(providerId).label,
      model: prev?.model,
      sponsor: prev?.sponsor ?? sponsor,
    });
  }

  if (Array.isArray(data.endpoints)) {
    for (const entry of data.endpoints) {
      const endpoint = normalizeEndpoint(entry);
      if (!endpoint) continue;
      const groupId = resolveEndpointGroupId(endpoint);
      ensureGroupDef(groups, groupId, endpoint);
      appendGroupEndpoint(endpointsByGroup, groupId, endpoint);
    }
  }

  for (const [groupId, endpoints] of endpointsByGroup) {
    endpointsByGroup.set(groupId, dedupeEndpointConfigs(endpoints));
  }

  return { groups, endpointsByGroup };
}

/** Drop group defs with no endpoints (stale publish config entries). */
export function pruneOrphanLlmGroupDefs(
  config: LlmEndpointGroupsConfig,
): LlmEndpointGroupsConfig {
  const groups = new Map(config.groups);
  for (const groupId of groups.keys()) {
    if (!(config.endpointsByGroup.get(groupId)?.length ?? 0)) {
      groups.delete(groupId);
    }
  }
  return { groups, endpointsByGroup: config.endpointsByGroup };
}

/** Flat endpoints without explicit groups — infer one group per provider. */
export function inferLlmEndpointGroupsConfig(
  endpoints: readonly LlmEndpointConfig[],
): LlmEndpointGroupsConfig {
  return parseLlmEndpointGroupsConfig({ version: 1, endpoints });
}

export function mergeGroupDefs(
  target: Map<string, LlmEndpointGroupDef>,
  incoming: Map<string, LlmEndpointGroupDef>,
): void {
  for (const [groupId, def] of incoming) {
    const prev = target.get(groupId);
    target.set(groupId, prev
      ? {
          ...prev,
          ...def,
          label: def.label ?? prev.label,
          model: def.model ?? prev.model,
          sponsor: def.sponsor ?? prev.sponsor,
        }
      : def);
  }
}

/**
 * Merge config layers. First layer has highest fallback priority for endpoints.
 * Later layers override group metadata (`groups`).
 */
export function mergeLlmEndpointGroupsConfigs(
  ...layers: readonly LlmEndpointGroupsConfig[]
): LlmEndpointGroupsConfig {
  const groups = new Map<string, LlmEndpointGroupDef>();
  const endpointsByGroup = new Map<string, LlmEndpointConfig[]>();

  for (const layer of layers) {
    mergeGroupDefs(groups, layer.groups);
  }

  for (const layer of layers) {
    for (const [groupId, endpoints] of layer.endpointsByGroup) {
      const existing = endpointsByGroup.get(groupId) ?? [];
      endpointsByGroup.set(
        groupId,
        dedupeEndpointConfigs([...existing, ...endpoints]),
      );
    }
  }

  for (const [groupId, endpoints] of endpointsByGroup) {
    if (!groups.has(groupId) && endpoints[0]) {
      ensureGroupDef(groups, groupId, endpoints[0]);
    }
  }

  return { groups, endpointsByGroup };
}

/** Overlay dev/local overrides: overlay endpoints first; overlay group defs win. */
export function overlayLlmEndpointGroupsConfigs(
  base: LlmEndpointGroupsConfig,
  overlay: LlmEndpointGroupsConfig,
): LlmEndpointGroupsConfig {
  const groups = new Map(base.groups);
  mergeGroupDefs(groups, overlay.groups);

  const endpointsByGroup = new Map<string, LlmEndpointConfig[]>();
  for (const [groupId, endpoints] of base.endpointsByGroup) {
    endpointsByGroup.set(groupId, [...endpoints]);
  }
  for (const [groupId, endpoints] of overlay.endpointsByGroup) {
    const existing = endpointsByGroup.get(groupId) ?? [];
    endpointsByGroup.set(
      groupId,
      dedupeEndpointConfigs([...endpoints, ...existing]),
    );
  }

  for (const [groupId, endpoints] of endpointsByGroup) {
    if (!groups.has(groupId) && endpoints[0]) {
      ensureGroupDef(groups, groupId, endpoints[0]);
    }
  }

  return { groups, endpointsByGroup };
}

export function resolveGroupModel(
  groupId: string,
  def: LlmEndpointGroupDef,
  endpoints: readonly LlmEndpointConfig[],
): string {
  const providerId = resolveGroupProvider(groupId, endpoints);
  const meta = getLlmProviderMeta(providerId);
  const raw = def.model?.trim()
    ?? endpoints[0]?.model?.trim()
    ?? meta.defaultModel;
  return providerId === DEEPSEEK_PROVIDER_ID
    ? resolveDeepSeekModelId(raw)
    : raw;
}

export function resolveGroupLabel(
  groupId: string,
  def: LlmEndpointGroupDef,
  endpoints: readonly LlmEndpointConfig[],
): string {
  if (def.label?.trim()) return def.label.trim();
  const providerId = resolveGroupProvider(groupId, endpoints);
  if (inferProviderFromGroupId(groupId)) {
    return getLlmProviderMeta(providerId).label;
  }
  return groupId;
}

function toResolvedGroup(
  groupId: string,
  def: LlmEndpointGroupDef,
  endpoints: LlmEndpointConfig[],
): ResolvedLlmEndpointGroup {
  return {
    id: groupId,
    providerId: resolveGroupProvider(groupId, endpoints),
    def,
    endpoints,
  };
}

export function listResolvedLlmEndpointGroups(
  config: LlmEndpointGroupsConfig,
): ResolvedLlmEndpointGroup[] {
  const rows: ResolvedLlmEndpointGroup[] = [];
  for (const [groupId, def] of config.groups) {
    const endpoints = config.endpointsByGroup.get(groupId) ?? [];
    if (!endpoints.length) continue;
    rows.push(toResolvedGroup(groupId, def, endpoints));
  }

  rows.sort((a, b) => {
    const ai = BUILTIN_GROUP_ORDER.indexOf(
      a.providerId as (typeof BUILTIN_GROUP_ORDER)[number],
    );
    const bi = BUILTIN_GROUP_ORDER.indexOf(
      b.providerId as (typeof BUILTIN_GROUP_ORDER)[number],
    );
    const aRank = ai === -1 ? 99 : ai;
    const bRank = bi === -1 ? 99 : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.id.localeCompare(b.id);
  });

  return rows;
}

export function getProviderEndpointChain(
  config: LlmEndpointGroupsConfig,
  providerId: LlmProviderId,
): LlmEndpointConfig[] {
  const groups = listResolvedLlmEndpointGroups(config).filter(
    (group) => group.providerId === providerId,
  );
  if (!groups.length) return [];
  return dedupeEndpointConfigs(groups.flatMap((group) => group.endpoints));
}

export function getGroupEndpointChain(
  config: LlmEndpointGroupsConfig,
  groupId: string,
): LlmEndpointConfig[] {
  return [...(config.endpointsByGroup.get(groupId) ?? [])];
}

export function sponsorsFromGroupsConfig(
  config: LlmEndpointGroupsConfig,
): Partial<Record<LlmProviderId, LlmBuiltinSponsor>> {
  const out: Partial<Record<LlmProviderId, LlmBuiltinSponsor>> = {};
  for (const group of listResolvedLlmEndpointGroups(config)) {
    if (group.def.sponsor) {
      out[group.providerId] = group.def.sponsor;
    }
  }
  return out;
}