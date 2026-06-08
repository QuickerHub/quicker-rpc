import {
  DEEPSEEK_PROVIDER_ID,
  getLlmProviderMeta,
  isKnownDeepSeekModelId,
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
  createCustomProfile,
  deleteCustomProfile,
  getStoredActiveSelection,
  listAllCustomProfiles,
  setStoredActiveSelection,
  toPublicProfile,
  updateCustomProfile,
  type LlmProfilePatch,
} from "@/lib/llm-profiles";
import { withReleasePreviewRoute } from "@/lib/release-preview.server";
import {
  getUserProviderUiSpec,
  USER_PROVIDER_UI,
  type UserSettingsField,
} from "@/lib/llm-user-providers";
import { formatLlmSelection, parseLlmSelection } from "@/lib/llm-selection";
import { resolveBuiltinModelSponsors } from "@/lib/llm-builtin-sponsors.server";
import {
  listBuiltinGroupDisplayRows,
  resolveMergedBuiltinDisplayModel,
  selectBuiltinAutoModel,
  selectBuiltinGroupEndpoint,
} from "@/lib/llm-builtin-display";
import {
  getRemotePublishConfigStatus,
  scheduleRemotePublishConfigRefreshOnStartup,
} from "@/lib/llm-remote-publish-config";

export const dynamic = "force-dynamic";

type ProviderKeyStatus = {
  configured: boolean;
  masked?: string;
  source?: "local" | "builtin" | "bundled" | "env";
};

type ProviderConfigStatus = {
  model: string;
  defaultModel: string;
  apiKey: ProviderKeyStatus;
  editableFields: readonly UserSettingsField[];
  baseURL?: string;
  defaultBaseURL?: string;
};

function resolveProviderModel(id: LlmProviderId): string {
  return resolveMergedBuiltinDisplayModel(id);
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
  const editableFields = getUserProviderUiSpec(id)?.settingsFields ?? [];
  const status: ProviderConfigStatus = {
    model: resolveProviderModel(id),
    defaultModel: meta.defaultModel,
    apiKey: providerKeyStatus(id),
    editableFields,
  };
  if (editableFields.includes("baseURL")) {
    status.baseURL = resolveProviderBaseURL(id);
    status.defaultBaseURL = meta.defaultBaseURL;
  }
  return status;
}

export async function GET() {
  return withReleasePreviewRoute(async () => {
  scheduleRemotePublishConfigRefreshOnStartup();
  const secrets = loadLlmLocalSecrets();
  const direct = secrets.directApiKey;
  const activeSelection = getStoredActiveSelection();
  const sponsors = resolveBuiltinModelSponsors();
  const builtinGroups = listBuiltinGroupDisplayRows();
  const remotePublishConfig = getRemotePublishConfigStatus();

  return Response.json({
    storagePath: resolveLlmSecretsPath(),
    sponsors,
    ...(remotePublishConfig ? { remotePublishConfig } : {}),
    providers: Object.fromEntries(
      USER_PROVIDER_UI.map((spec) => [spec.id, providerConfigStatus(spec.id)]),
    ),
    profiles: listAllCustomProfiles().map(toPublicProfile),
    activeSelection: activeSelection
      ? formatLlmSelection(activeSelection)
      : undefined,
    ...(builtinGroups.length ? { builtinGroups } : {}),
    direct: {
      configured: Boolean(direct?.trim() || process.env.LLM_API_KEY?.trim()),
      masked: direct ? maskSecret(direct) : undefined,
      source: direct ? ("local" as const) : process.env.LLM_API_KEY?.trim()
        ? ("env" as const)
        : undefined,
    },
  });
  });
}

type ProfileWriteBody = {
  id?: string;
  title?: string;
  description?: string;
  apiKey?: string;
  baseURL?: string;
  models?: string[];
  defaultModel?: string;
  hidden?: boolean;
};

type ProviderPatchBody = {
  apiKey?: string;
  baseURL?: string;
  model?: string;
};

type PutBody = {
  providers?: Partial<Record<LlmProviderId, ProviderPatchBody>>;
  directApiKey?: string;
  activeSelection?: string | null;
  selectBuiltinEndpoint?: {
    groupId: string;
    endpointId: string;
  };
  selectAutoModel?: {
    modelId: string;
  };
  createProfile?: ProfileWriteBody;
  updateProfile?: ProfileWriteBody & { id: string };
  deleteProfileId?: string;
};

export async function PUT(req: Request) {
  return withReleasePreviewRoute(async () => {
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
        const modelValue = typeof raw.model === "string"
          ? raw.model.trim() || null
          : null;
        if (
          modelValue
          && spec.id === DEEPSEEK_PROVIDER_ID
          && !isKnownDeepSeekModelId(modelValue)
        ) {
          return Response.json(
            { error: `Invalid DeepSeek model: ${modelValue}` },
            { status: 400 },
          );
        }
        patch.model = modelValue;
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
    saveLlmLocalSecrets({
      ...current,
      directApiKey,
    });
  }

  if (body.activeSelection !== undefined) {
    if (body.activeSelection === null || body.activeSelection === "") {
      setStoredActiveSelection(undefined);
    } else {
      const selection = parseLlmSelection(body.activeSelection);
      if (!selection) {
        return Response.json({ error: "Invalid activeSelection" }, { status: 400 });
      }
      setStoredActiveSelection(selection);
    }
  }

  if (body.createProfile && typeof body.createProfile === "object") {
    const raw = body.createProfile;
    try {
      createCustomProfile({
        ...(typeof raw.title === "string" && raw.title.trim()
          ? { title: raw.title.trim() }
          : {}),
        apiKey: raw.apiKey ?? "",
        baseURL: raw.baseURL ?? "",
        models: raw.models ?? [],
        ...(typeof raw.description === "string" && raw.description.trim()
          ? { description: raw.description.trim() }
          : {}),
        defaultModel: raw.defaultModel,
        hidden: raw.hidden,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (body.updateProfile && typeof body.updateProfile === "object") {
    const raw = body.updateProfile;
    if (!raw.id?.trim()) {
      return Response.json({ error: "updateProfile.id is required" }, { status: 400 });
    }
    const patch: LlmProfilePatch = {};
    if (raw.title !== undefined) patch.title = raw.title;
    if (raw.description !== undefined) patch.description = raw.description;
    if (raw.apiKey !== undefined) patch.apiKey = raw.apiKey;
    if (raw.baseURL !== undefined) patch.baseURL = raw.baseURL;
    if (raw.models !== undefined) patch.models = raw.models;
    if (raw.defaultModel !== undefined) patch.defaultModel = raw.defaultModel;
    if (raw.hidden !== undefined) patch.hidden = raw.hidden;
    try {
      updateCustomProfile(raw.id, patch);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (typeof body.deleteProfileId === "string" && body.deleteProfileId.trim()) {
    deleteCustomProfile(body.deleteProfileId.trim());
  }

  if (body.selectBuiltinEndpoint && typeof body.selectBuiltinEndpoint === "object") {
    const groupId = body.selectBuiltinEndpoint.groupId?.trim();
    const endpointId = body.selectBuiltinEndpoint.endpointId?.trim();
    if (!groupId || !endpointId) {
      return Response.json(
        { error: "selectBuiltinEndpoint.groupId and endpointId are required" },
        { status: 400 },
      );
    }
    if (!selectBuiltinGroupEndpoint(groupId, endpointId)) {
      return Response.json(
        { error: "Builtin endpoint not found" },
        { status: 400 },
      );
    }
  }

  if (body.selectAutoModel && typeof body.selectAutoModel === "object") {
    const modelId = body.selectAutoModel.modelId?.trim();
    if (!modelId) {
      return Response.json(
        { error: "selectAutoModel.modelId is required" },
        { status: 400 },
      );
    }
    if (!selectBuiltinAutoModel(modelId)) {
      return Response.json(
        { error: "Auto model not found" },
        { status: 400 },
      );
    }
  }

  const sponsors = resolveBuiltinModelSponsors();
  const builtinGroups = listBuiltinGroupDisplayRows();

  return Response.json({
    ok: true,
    sponsors,
    ...(builtinGroups.length ? { builtinGroups } : {}),
    providers: Object.fromEntries(
      USER_PROVIDER_UI.map((spec) => [spec.id, providerConfigStatus(spec.id)]),
    ),
    profiles: listAllCustomProfiles().map(toPublicProfile),
    activeSelection: getStoredActiveSelection()
      ? formatLlmSelection(getStoredActiveSelection()!)
      : undefined,
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
  });
}
