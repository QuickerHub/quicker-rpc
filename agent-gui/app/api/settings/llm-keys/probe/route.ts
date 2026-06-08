import {
  isAutoBuiltinGroupId,
  listBuiltinGroupDisplayRows,
  resolveBuiltinGroupForProbe,
  resolveGroupProbeEndpoints,
} from "@/lib/llm-builtin-display";
import { endpointConfigFingerprint } from "@/lib/llm-config";
import { listAutoModelCandidateIds } from "@/lib/llm-auto";
import { probeLlmEndpointConfig, probeLlmProviderAvailability } from "@/lib/llm";
import { USER_MODEL_SELECTOR_IDS } from "@/lib/llm-user-providers";
import { withReleasePreviewRoute } from "@/lib/release-preview.server";

export const dynamic = "force-dynamic";

type EndpointProbeEntry = {
  reachable: boolean;
  message?: string;
  latencyMs?: number;
};

type GroupProbeResult = {
  configured: boolean;
  reachable: boolean;
  message?: string;
  latencyMs?: number;
  endpoints?: Record<string, EndpointProbeEntry>;
  autoModels?: Record<string, EndpointProbeEntry>;
};

async function probeAutoGroupAvailability(
  groupId: string,
  timeoutMs: number,
): Promise<GroupProbeResult> {
  const group = resolveBuiltinGroupForProbe(groupId);
  if (!group) {
    return { configured: false, reachable: false, message: "未配置" };
  }

  const endpoints = resolveGroupProbeEndpoints(group);
  const endpoint = endpoints[0];
  if (!endpoint) {
    return { configured: false, reachable: false, message: "未配置" };
  }

  const candidates = listAutoModelCandidateIds();
  const autoModelResults: NonNullable<GroupProbeResult["autoModels"]> = {};
  let selectedResult: EndpointProbeEntry | undefined;
  let lastError: unknown;

  await Promise.all(
    candidates.map(async (modelId) => {
      const started = Date.now();
      const result = await probeLlmEndpointConfig(group.providerId, {
        ...endpoint,
        model: modelId,
      }, { timeoutMs });
      const entry: EndpointProbeEntry = {
        reachable: Boolean(result.reachable),
        message: result.message,
        latencyMs: result.latencyMs ?? (result.reachable ? Date.now() - started : undefined),
      };
      autoModelResults[modelId] = entry;
      if (!result.reachable) {
        lastError = result.message;
      }
    }),
  );

  for (const modelId of candidates) {
    const entry = autoModelResults[modelId];
    if (entry?.reachable) {
      selectedResult = entry;
      break;
    }
  }

  if (selectedResult) {
    return {
      configured: true,
      reachable: true,
      message: selectedResult.message,
      latencyMs: selectedResult.latencyMs,
      autoModels: autoModelResults,
    };
  }

  return {
    configured: true,
    reachable: false,
    message: lastError instanceof Error
      ? lastError.message
      : typeof lastError === "string"
        ? lastError
        : "候选模型均不可用",
    autoModels: autoModelResults,
  };
}

async function probeBuiltinGroupAvailability(
  groupId: string,
  timeoutMs: number,
): Promise<GroupProbeResult> {
  if (isAutoBuiltinGroupId(groupId)) {
    return probeAutoGroupAvailability(groupId, timeoutMs);
  }

  const group = resolveBuiltinGroupForProbe(groupId);
  if (!group) {
    return { configured: false, reachable: false, message: "未配置" };
  }

  const endpoints = resolveGroupProbeEndpoints(group);
  if (!endpoints.length) {
    return { configured: false, reachable: false, message: "未配置" };
  }

  const endpointResults: NonNullable<GroupProbeResult["endpoints"]> = {};
  let firstReachable: GroupProbeResult | undefined;
  let lastError: unknown;

  await Promise.all(
    endpoints.map(async (endpoint) => {
      const id = endpointConfigFingerprint(endpoint);
      const started = Date.now();
      const result = await probeLlmEndpointConfig(group.providerId, endpoint, {
        timeoutMs,
      });
      endpointResults[id] = {
        reachable: Boolean(result.reachable),
        message: result.message,
        latencyMs: result.latencyMs ?? (result.reachable ? Date.now() - started : undefined),
      };
      if (result.reachable && !firstReachable) {
        firstReachable = {
          configured: true,
          reachable: true,
          message: result.message,
          latencyMs: result.latencyMs ?? Date.now() - started,
        };
      }
      if (!result.reachable) {
        lastError = result.message;
      }
    }),
  );

  if (firstReachable) {
    return {
      ...firstReachable,
      endpoints: endpointResults,
    };
  }

  return {
    configured: true,
    reachable: false,
    message: lastError instanceof Error
      ? lastError.message
      : typeof lastError === "string"
        ? lastError
        : "组内 endpoint 均不可用",
    endpoints: endpointResults,
  };
}

export async function GET() {
  return withReleasePreviewRoute(async () => {
  const groups = listBuiltinGroupDisplayRows();
  const timeoutMs = 8_000;

  if (groups.length > 0) {
    const rowEntries = await Promise.all(
      groups.map(async (group) => {
        const result = await probeBuiltinGroupAvailability(group.id, timeoutMs);
        return [group.id, result] as const;
      }),
    );

    return Response.json({
      ok: true,
      mode: "groups",
      checkedAt: new Date().toISOString(),
      groups: Object.fromEntries(rowEntries),
    });
  }

  const entries = await Promise.all(
    USER_MODEL_SELECTOR_IDS.map(async (providerId) => {
      const result = await probeLlmProviderAvailability(providerId, { timeoutMs });
      return [providerId, result] as const;
    }),
  );

  return Response.json({
    ok: true,
    mode: "merged",
    checkedAt: new Date().toISOString(),
    providers: Object.fromEntries(entries),
  });
  });
}
