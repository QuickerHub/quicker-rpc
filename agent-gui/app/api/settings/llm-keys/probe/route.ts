import {
  listBuiltinGroupDisplayRows,
  resolveBuiltinGroupForProbe,
  resolveGroupProbeEndpoints,
} from "@/lib/llm-builtin-display";
import { probeLlmEndpointConfig, probeLlmProviderAvailability } from "@/lib/llm";
import { USER_MODEL_SELECTOR_IDS } from "@/lib/llm-user-providers";
import { withReleasePreviewRoute } from "@/lib/release-preview.server";

export const dynamic = "force-dynamic";

async function probeGroupAvailability(
  groupId: string,
  timeoutMs: number,
) {
  const group = resolveBuiltinGroupForProbe(groupId);
  if (!group) {
    return { configured: false, reachable: false, message: "未配置" };
  }

  const endpoints = resolveGroupProbeEndpoints(group);
  if (!endpoints.length) {
    return { configured: false, reachable: false, message: "未配置" };
  }

  let lastError: unknown;
  for (const endpoint of endpoints) {
    const started = Date.now();
    const result = await probeLlmEndpointConfig(group.providerId, endpoint, {
      timeoutMs,
    });
    if (result.reachable) {
      return {
        ...result,
        latencyMs: result.latencyMs ?? Date.now() - started,
      };
    }
    lastError = result.message;
  }

  return {
    configured: true,
    reachable: false,
    message: lastError instanceof Error
      ? lastError.message
      : typeof lastError === "string"
        ? lastError
        : "组内 endpoint 均不可用",
  };
}

export async function GET() {
  return withReleasePreviewRoute(async () => {
  const groups = listBuiltinGroupDisplayRows();
  const timeoutMs = 8_000;

  if (groups.length > 0) {
    const rowEntries = await Promise.all(
      groups.map(async (group) => {
        const result = await probeGroupAvailability(group.id, timeoutMs);
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
