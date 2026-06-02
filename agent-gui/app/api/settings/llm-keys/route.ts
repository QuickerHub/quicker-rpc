import {
  getLlmProviderMeta,
  type LlmProviderId,
} from "@/lib/llm-providers";
import { resolveLlmConfigProvider } from "@/lib/llm-config";
import { hasBundledProviderApiKey } from "@/lib/llm-bundled-secrets";
import {
  getLocalProviderConfig,
  loadLlmLocalSecrets,
  maskSecret,
  resolveLlmSecretsPath,
  saveLlmLocalSecrets,
  setLocalProviderConfig,
} from "@/lib/llm-local-secrets";
import { isLlmProviderConfigured } from "@/lib/llm";
import {
  getUserProviderUiSpec,
  USER_PROVIDER_UI,
  type UserSettingsField,
} from "@/lib/llm-user-providers";

export const dynamic = "force-dynamic";

type ProviderKeyStatus = {
  configured: boolean;
  masked?: string;
  source?: "local" | "builtin" | "bundled" | "env";
};

type ProviderConfigStatus = {
  baseURL: string;
  model: string;
  defaultBaseURL: string;
  defaultModel: string;
  apiKey: ProviderKeyStatus;
  editableFields: readonly UserSettingsField[];
};

function resolveProviderModel(id: LlmProviderId): string {
  const meta = getLlmProviderMeta(id);
  return (
    getLocalProviderConfig(id)?.model
    ?? resolveLlmConfigProvider(id)?.model
    ?? meta.defaultModel
  );
}

function resolveProviderBaseURL(id: LlmProviderId): string {
  const meta = getLlmProviderMeta(id);
  return (
    getLocalProviderConfig(id)?.baseURL
    ?? resolveLlmConfigProvider(id)?.baseURL
    ?? meta.defaultBaseURL
  );
}

function providerKeyStatus(id: LlmProviderId): ProviderKeyStatus {
  const local = getLocalProviderConfig(id)?.apiKey;
  const fromConfig = resolveLlmConfigProvider(id)?.apiKey;
  const configured = isLlmProviderConfigured(id);
  if (local) {
    return {
      configured: true,
      masked: maskSecret(local),
      source: "local",
    };
  }
  if (fromConfig) {
    return {
      configured: true,
      masked: maskSecret(fromConfig),
      source: "builtin",
    };
  }
  if (hasBundledProviderApiKey(id)) {
    return { configured: true, source: "bundled" };
  }
  if (configured) {
    return { configured: true, source: "env" };
  }
  return { configured: false };
}

function providerConfigStatus(id: LlmProviderId): ProviderConfigStatus {
  const meta = getLlmProviderMeta(id);
  return {
    baseURL: resolveProviderBaseURL(id),
    model: resolveProviderModel(id),
    defaultBaseURL: meta.defaultBaseURL,
    defaultModel: meta.defaultModel,
    apiKey: providerKeyStatus(id),
    editableFields: getUserProviderUiSpec(id)?.settingsFields ?? [],
  };
}

export async function GET() {
  const secrets = loadLlmLocalSecrets();
  const direct = secrets.directApiKey;
  return Response.json({
    storagePath: resolveLlmSecretsPath(),
    providers: Object.fromEntries(
      USER_PROVIDER_UI.map((spec) => [spec.id, providerConfigStatus(spec.id)]),
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
    for (const spec of USER_PROVIDER_UI) {
      const raw = body.providers[spec.id];
      if (!raw || typeof raw !== "object") continue;

      const patch: {
        apiKey?: string | null;
        baseURL?: string | null;
        model?: string | null;
      } = {};

      if ("apiKey" in raw && spec.settingsFields.includes("apiKey")) {
        patch.apiKey =
          typeof raw.apiKey === "string" && raw.apiKey.trim()
            ? raw.apiKey.trim()
            : null;
      }
      if ("baseURL" in raw && spec.settingsFields.includes("baseURL")) {
        patch.baseURL = typeof raw.baseURL === "string"
          ? raw.baseURL.trim() || null
          : null;
      }
      if ("model" in raw && spec.settingsFields.includes("model")) {
        patch.model = typeof raw.model === "string"
          ? raw.model.trim() || null
          : null;
      }

      if (Object.keys(patch).length > 0) {
        setLocalProviderConfig(spec.id, patch);
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
      USER_PROVIDER_UI.map((spec) => [spec.id, providerConfigStatus(spec.id)]),
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
