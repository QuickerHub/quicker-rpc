import type { LlmEndpointConfig } from "@/lib/llm-config";
import type { LlmEndpointGroupDef } from "@/lib/llm-endpoint-groups";
import {
  buildAutoLlmEndpointChain,
  resolveAutoModelCandidates,
} from "@/lib/llm-auto";
import {
  loadDevConfigEndpoints,
  loadMergedPublishGroupsConfig,
  loadPublishGroupsConfig,
  loadPublishOnlyConfigEndpoints,
} from "@/lib/llm-publish-config";
import { resolveLlmConfigEndpointSlots } from "@/lib/llm-config";
import {
  mergeProbeTargets,
  probeLlmEndpointTarget,
  runLlmEndpointProbeReport,
  targetFromEndpoint,
  type LlmEndpointProbeReport,
  type LlmEndpointProbeTarget,
  type LlmProbeConfigSource,
  type LlmProbeMethod,
} from "@/lib/llm-endpoint-probe-core";

export type {
  LlmEndpointProbeReport,
  LlmEndpointProbeRow,
  LlmEndpointProbeSummary,
  LlmEndpointProbeTarget,
  LlmProbeConfigSource,
  LlmProbeMethod,
} from "@/lib/llm-endpoint-probe-core";

export {
  maskLlmApiKey,
  hostFromLlmBaseUrl,
  parseLlmProbeConfigSource,
  parseLlmProbeMethod,
  probeLlmEndpointTarget,
} from "@/lib/llm-endpoint-probe-core";

function addPublishTargets(
  bucket: Map<string, LlmEndpointProbeTarget>,
  source: "publish" | "dev" | "merged",
  endpoints: readonly LlmEndpointConfig[],
  groups?: Map<string, LlmEndpointGroupDef>,
): void {
  endpoints.forEach((endpoint, index) => {
    const groupId = endpoint.group?.trim();
    const groupLabel = groupId && groups
      ? groups.get(groupId)?.label ?? groupId
      : groupId;
    mergeProbeTargets(
      bucket,
      targetFromEndpoint(endpoint, `${source}#${index + 1}`, {
        group: groupId,
        groupLabel,
      }),
    );
  });
}

function addAutoModelTargets(bucket: Map<string, LlmEndpointProbeTarget>): void {
  const credentials = buildAutoLlmEndpointChain()[0];
  if (!credentials) return;

  for (const [index, modelId] of resolveAutoModelCandidates().entries()) {
    const target = targetFromEndpoint(
      {
        apiKey: credentials.apiKey,
        baseURL: credentials.baseURL,
        model: modelId,
        group: "auto",
      },
      `auto#${index + 1}`,
      { group: "auto", groupLabel: "Auto candidates" },
    );
    bucket.set(`${target.id}\0${modelId}`, target);
  }
}

export function listLlmProbeTargets(
  source: LlmProbeConfigSource = "all",
): LlmEndpointProbeTarget[] {
  const bucket = new Map<string, LlmEndpointProbeTarget>();
  const sources = source === "all"
    ? ["publish", "dev", "merged", "llm-config"] as const
    : [source] as const;

  for (const item of sources) {
    if (item === "publish") {
      const config = loadPublishGroupsConfig();
      addPublishTargets(
        bucket,
        "publish",
        loadPublishOnlyConfigEndpoints(),
        config.groups,
      );
      continue;
    }
    if (item === "dev") {
      addPublishTargets(bucket, "dev", loadDevConfigEndpoints());
      continue;
    }
    if (item === "merged") {
      const merged = loadMergedPublishGroupsConfig();
      const endpoints = Array.from(merged.endpointsByGroup.values()).flat();
      addPublishTargets(bucket, "merged", endpoints, merged.groups);
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
      addAutoModelTargets(bucket);
    }
  }

  return Array.from(bucket.values());
}

export async function probeAllLlmEndpoints(options?: {
  source?: LlmProbeConfigSource;
  method?: LlmProbeMethod;
  timeoutMs?: number;
  concurrency?: number;
  includeAutoModels?: boolean;
}): Promise<LlmEndpointProbeReport> {
  return runLlmEndpointProbeReport({
    source: options?.source ?? "all",
    method: options?.method ?? "models",
    timeoutMs: options?.timeoutMs ?? 12_000,
    concurrency: options?.concurrency,
    includeAutoModels: options?.includeAutoModels,
    listTargets: listLlmProbeTargets,
  });
}
