import {
  getLlmProviderMeta,
  LLM_PROVIDER_LIST,
  type LlmProviderId,
} from "@/lib/llm-providers";
import {
  resolveLlmConfigPath,
  resolveLlmConfigProvider,
} from "@/lib/llm-config";
import {
  loadLlmLocalSecrets,
  maskSecret,
  resolveLlmSecretsPath,
  saveLlmLocalSecrets,
  setLocalProviderConfig,
} from "@/lib/llm-local-secrets";
import { isLlmProviderConfigured } from "@/lib/llm";

export const dynamic = "force-dynamic";

type ProviderKeyStatus = {
  configured: boolean;
  masked?: string;
  source?: "local" | "config" | "env";
};

type ProviderConfigStatus = {
  baseURL: string;
  model: string;
  defaultBaseURL: string;
  defaultModel: string;
  apiKey: ProviderKeyStatus;
};

function providerKeyStatus(id: LlmProviderId): ProviderKeyStatus {
  const legacy = loadLlmLocalSecrets().providers[id];
  const fromConfig = resolveLlmConfigProvider(id)?.apiKey;
  const key = legacy ?? fromConfig;
  const configured = isLlmProviderConfigured(id);
  return {
    configured,
    masked: key ? maskSecret(key) : undefined,
    source: legacy
      ? ("local" as const)
      : fromConfig
        ? ("config" as const)
        : configured
          ? ("env" as const)
          : undefined,
  };
}

function providerConfigStatus(id: LlmProviderId): ProviderConfigStatus {
  const meta = getLlmProviderMeta(id);
  const entry = resolveLlmConfigProvider(id);
  return {
    baseURL: entry?.baseURL ?? meta.defaultBaseURL,
    model: entry?.model ?? meta.defaultModel,
    defaultBaseURL: meta.defaultBaseURL,
    defaultModel: meta.defaultModel,
    apiKey: providerKeyStatus(id),
  };
}

export async function GET() {
  const secrets = loadLlmLocalSecrets();
  const direct = secrets.directApiKey;
  return Response.json({
    configPath: resolveLlmConfigPath(),
    storagePath: resolveLlmSecretsPath(),
    providers: Object.fromEntries(
      LLM_PROVIDER_LIST.map((p) => [p.id, providerConfigStatus(p.id)]),
    ),
    direct: {
      configured: Boolean(direct?.trim() || process.env.LLM_API_KEY?.trim()),
      masked: direct ? maskSecret(direct) : undefined,
      source: direct ? ("local" as const) : process.env.LLM_API_KEY?.trim()
        ? ("env" as const)
        : undefined,
    },
  });
}

type ProviderPatchBody = {
  apiKey?: string;
  baseURL?: string;
  model?: string;
};

type PutBody = {
  providers?: Partial<Record<LlmProviderId, ProviderPatchBody>>;
  directApiKey?: string;
};

export async function PUT(req: Request) {
  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.providers && typeof body.providers === "object") {
    for (const meta of LLM_PROVIDER_LIST) {
      const raw = body.providers[meta.id];
      if (!raw || typeof raw !== "object") continue;

      const patch: {
        apiKey?: string | null;
        baseURL?: string | null;
        model?: string | null;
      } = {};

      if ("apiKey" in raw) {
        patch.apiKey =
          typeof raw.apiKey === "string" && raw.apiKey.trim()
            ? raw.apiKey.trim()
            : null;
      }
      if ("baseURL" in raw && typeof raw.baseURL === "string") {
        patch.baseURL = raw.baseURL.trim() || null;
      }
      if ("model" in raw && typeof raw.model === "string") {
        patch.model = raw.model.trim() || null;
      }

      if (Object.keys(patch).length > 0) {
        setLocalProviderConfig(meta.id, patch);
      }
    }
  }

  const current = loadLlmLocalSecrets();
  let directApiKey = current.directApiKey;
  if (typeof body.directApiKey === "string") {
    const trimmed = body.directApiKey.trim();
    directApiKey = trimmed || undefined;
    saveLlmLocalSecrets({ version: 1, providers: current.providers, directApiKey });
  }

  return Response.json({
    ok: true,
    providers: Object.fromEntries(
      LLM_PROVIDER_LIST.map((p) => [p.id, providerConfigStatus(p.id)]),
    ),
    direct: {
      configured: Boolean(
        directApiKey?.trim() || process.env.LLM_API_KEY?.trim(),
      ),
      masked: directApiKey ? maskSecret(directApiKey) : undefined,
      source: directApiKey ? ("local" as const) : process.env.LLM_API_KEY?.trim()
        ? ("env" as const)
        : undefined,
    },
  });
}
