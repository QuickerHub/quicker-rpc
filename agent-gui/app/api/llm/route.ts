import {
  getLlmProviderMeta,
  parseLlmProviderId,
  type LlmProviderId,
} from "@/lib/llm-providers";
import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import { getLocalDirectApiKey } from "@/lib/llm-local-secrets";
import { isLlmProviderHidden } from "@/lib/llm-config";
import { USER_MODEL_SELECTOR_IDS, isUserModelSelectorProvider } from "@/lib/llm-user-providers";
import {
  getChatModelId,
  getLlmProviderId,
  isLlmProviderConfigured,
  resolveLlmConfig,
} from "@/lib/llm";

export const dynamic = "force-dynamic";

function envModelForProvider(id: LlmProviderId): string {
  const directKey = getLocalDirectApiKey() ?? process.env.LLM_API_KEY?.trim();
  if (directKey && process.env.LLM_MODEL?.trim()) {
    return process.env.LLM_MODEL.trim();
  }
  try {
    return getChatModelId(id);
  } catch {
    return getLlmProviderMeta(id).defaultModel;
  }
}

function contextLimitForModel(modelId: string, providerId: LlmProviderId) {
  const resolved = resolveModelContextLimit(modelId, providerId);
  return {
    contextLimit: resolved.tokens,
    contextLimitSource: resolved.source,
  };
}

export async function GET() {
  const defaultProvider = getLlmProviderId();
  const providers = USER_MODEL_SELECTOR_IDS.filter(
    (id) => !isLlmProviderHidden(id),
  ).map((id) => {
    const meta = getLlmProviderMeta(id);
    const modelId = envModelForProvider(id);
    return {
      id: meta.id,
      label: meta.label,
      description: meta.description,
      modelId,
      configured: isLlmProviderConfigured(id),
      ...contextLimitForModel(modelId, id),
    };
  });

  let activeProvider = defaultProvider;
  try {
    const resolved = resolveLlmConfig().providerId;
    if (
      isUserModelSelectorProvider(resolved)
      && !isLlmProviderHidden(resolved)
    ) {
      activeProvider = resolved;
    }
  } catch {
    const firstConfigured = providers.find((p) => p.configured);
    if (firstConfigured) {
      activeProvider = firstConfigured.id as LlmProviderId;
    }
  }

  const visibleDefault = providers.some((p) => p.id === defaultProvider)
    ? defaultProvider
    : (providers[0]?.id ?? "bingleimuzi");

  return Response.json({
    defaultProvider: visibleDefault,
    activeProvider,
    providers,
    directOverride: Boolean(
      getLocalDirectApiKey() || process.env.LLM_API_KEY?.trim(),
    ),
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { provider?: string };
  const providerId = parseLlmProviderId(body.provider);
  if (!providerId || !isUserModelSelectorProvider(providerId)) {
    return Response.json({ error: "Invalid provider" }, { status: 400 });
  }
  if (isLlmProviderHidden(providerId)) {
    return Response.json(
      { error: `Provider "${providerId}" is not available` },
      { status: 400 },
    );
  }
  if (!isLlmProviderConfigured(providerId)) {
    return Response.json(
      { error: `Provider "${providerId}" is not configured` },
      { status: 400 },
    );
  }
  try {
    const config = resolveLlmConfig(providerId);
    return Response.json({
      providerId: config.providerId,
      modelId: config.modelId,
      ...contextLimitForModel(config.modelId, config.providerId),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
