import {
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
  setLocalProviderApiKey,
} from "@/lib/llm-local-secrets";
import { isLlmProviderConfigured } from "@/lib/llm";

export const dynamic = "force-dynamic";

function providerStatus(id: LlmProviderId) {
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

export async function GET() {
  const secrets = loadLlmLocalSecrets();
  const direct = secrets.directApiKey;
  return Response.json({
    configPath: resolveLlmConfigPath(),
    storagePath: resolveLlmSecretsPath(),
    providers: Object.fromEntries(
      LLM_PROVIDER_LIST.map((p) => [p.id, providerStatus(p.id)]),
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

type PutBody = {
  providers?: Partial<Record<LlmProviderId, string>>;
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
      if (!(meta.id in body.providers)) continue;
      const raw = body.providers[meta.id];
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      setLocalProviderApiKey(meta.id, trimmed || undefined);
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
      LLM_PROVIDER_LIST.map((p) => [p.id, providerStatus(p.id)]),
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
