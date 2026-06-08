import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveAgentGuiRoot } from "@/lib/agent-gui-root";
import {
  dedupeEndpointConfigs,
  resolveLlmConfigEndpointSlots,
  type LlmEndpointConfig,
} from "@/lib/llm-config";
import {
  mergeAutoModelCandidates,
  LLM_AUTO_MODEL_CANDIDATES,
} from "@/lib/llm-auto-candidates";
import type { LlmEndpointGroupDef } from "@/lib/llm-endpoint-groups";
import {
  mergeProbeTargets,
  targetFromEndpoint,
  type LlmEndpointProbeTarget,
  type LlmProbeConfigSource,
} from "@/lib/llm-endpoint-probe-core";

type GroupsJson = Record<string, LlmEndpointGroupDef & { autoModels?: string[] }>;

type GroupsConfigJson = {
  groups?: GroupsJson;
  endpoints?: LlmEndpointConfig[];
};

function readJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function normalizeEndpoint(raw: unknown): LlmEndpointConfig | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as LlmEndpointConfig;
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

function parseGroupsConfig(raw: unknown): {
  groups: GroupsJson;
  endpoints: LlmEndpointConfig[];
} {
  if (typeof raw !== "object" || raw === null) {
    return { groups: {}, endpoints: [] };
  }
  const data = raw as GroupsConfigJson;
  const groups = (typeof data.groups === "object" && data.groups !== null)
    ? data.groups
    : {};
  const endpoints = Array.isArray(data.endpoints)
    ? data.endpoints.map(normalizeEndpoint).filter((item): item is LlmEndpointConfig => Boolean(item))
    : [];
  return { groups, endpoints };
}

function addPublishTargets(
  bucket: Map<string, LlmEndpointProbeTarget>,
  source: "publish" | "dev" | "merged",
  endpoints: readonly LlmEndpointConfig[],
  groups?: GroupsJson,
): void {
  endpoints.forEach((endpoint, index) => {
    const groupId = endpoint.group?.trim();
    const groupLabel = groupId ? groups?.[groupId]?.label ?? groupId : groupId;
    mergeProbeTargets(
      bucket,
      targetFromEndpoint(endpoint, `${source}#${index + 1}`, {
        group: groupId,
        groupLabel,
      }),
    );
  });
}

function overlayEndpoints(
  base: LlmEndpointConfig[],
  overlay: LlmEndpointConfig[],
): LlmEndpointConfig[] {
  return dedupeEndpointConfigs([...overlay, ...base]);
}

function resolveAutoTargetsFromNvidia(
  publish: ReturnType<typeof parseGroupsConfig>,
  dev: ReturnType<typeof parseGroupsConfig>,
): LlmEndpointProbeTarget[] {
  const mergedEndpoints = overlayEndpoints(publish.endpoints, dev.endpoints);
  const nvidiaEndpoint = mergedEndpoints.find((item) => item.group === "nvidia")
    ?? mergedEndpoints.find((item) => item.baseURL?.includes("nvidia.com"));
  if (!nvidiaEndpoint) return [];

  const nvidiaGroup = {
    ...publish.groups.nvidia,
    ...dev.groups.nvidia,
  };
  const models = mergeAutoModelCandidates({
    primary: nvidiaEndpoint.model ?? nvidiaGroup.model,
    configured: nvidiaGroup.autoModels,
    defaults: LLM_AUTO_MODEL_CANDIDATES,
  });

  const bucket = new Map<string, LlmEndpointProbeTarget>();
  models.forEach((modelId, index) => {
    const target = targetFromEndpoint(
      {
        apiKey: nvidiaEndpoint.apiKey,
        baseURL: nvidiaEndpoint.baseURL,
        model: modelId,
        group: "auto",
      },
      `auto#${index + 1}`,
      { group: "auto", groupLabel: "Auto candidates" },
    );
    bucket.set(`${target.id}\0${modelId}`, target);
  });
  return Array.from(bucket.values());
}

export function listLlmProbeTargetsFromFiles(
  source: LlmProbeConfigSource = "all",
): LlmEndpointProbeTarget[] {
  const root = resolveAgentGuiRoot();
  const publishPath = process.env.BUNDLED_LLM_CONFIG_PATH?.trim()
    ?? join(root, "llm-publish.config.json");
  const devPath = process.env.BUNDLED_LLM_DEV_CONFIG_PATH?.trim()
    ?? join(root, "llm-dev.config.json");

  const publishRaw = readJson(publishPath);
  const devRaw = readJson(devPath);
  const publish = parseGroupsConfig(publishRaw);
  const dev = parseGroupsConfig(devRaw);

  const bucket = new Map<string, LlmEndpointProbeTarget>();
  const sources = source === "all"
    ? ["publish", "dev", "merged", "llm-config"] as const
    : [source] as const;

  for (const item of sources) {
    if (item === "publish") {
      addPublishTargets(bucket, "publish", publish.endpoints, publish.groups);
      continue;
    }
    if (item === "dev") {
      addPublishTargets(bucket, "dev", dev.endpoints, dev.groups);
      continue;
    }
    if (item === "merged") {
      addPublishTargets(
        bucket,
        "merged",
        overlayEndpoints(publish.endpoints, dev.endpoints),
        { ...publish.groups, ...dev.groups },
      );
      continue;
    }
    if (item === "llm-config") {
      for (const [index, endpoint] of resolveLlmConfigEndpointSlots().entries()) {
        mergeProbeTargets(
          bucket,
          targetFromEndpoint(endpoint, `llm-config#${index + 1}`, {
            group: "llm-config",
            groupLabel: index === 0 ? "llm-config primary" : `llm-config fallback ${index}`,
          }),
        );
      }
      continue;
    }
    if (item === "auto") {
      for (const target of resolveAutoTargetsFromNvidia(publish, dev)) {
        mergeProbeTargets(bucket, target);
      }
    }
  }

  return Array.from(bucket.values());
}
