import { newRandomId } from "@/lib/new-id";
import type { LlmLocalSecrets, LlmLocalProviderSecrets } from "@/lib/llm-local-secrets";
import type { LlmCustomProfile } from "@/lib/llm-profile-schema";
import {
  CUSTOM_PROVIDER_ID,
  getLlmProviderMeta,
  LLM_PROVIDER_ID,
} from "@/lib/llm-providers";
import {
  formatLlmSelection,
  parseLlmSelection,
  profileSelection,
} from "@/lib/llm-selection";

function resolveProfileDefaultModel(profile: LlmCustomProfile): string {
  const preferred = profile.defaultModel?.trim();
  if (preferred && profile.models.includes(preferred)) return preferred;
  return profile.models[0]!;
}

function profileFromLegacyCustomProvider(
  legacy: LlmLocalProviderSecrets,
  title = "Custom",
): LlmCustomProfile | undefined {
  const apiKey = legacy.apiKey?.trim();
  if (!apiKey) return undefined;

  const meta = getLlmProviderMeta(CUSTOM_PROVIDER_ID);
  const model = legacy.model?.trim() || meta.defaultModel;
  return {
    id: newRandomId(),
    title,
    description: meta.description,
    apiKey,
    baseURL: legacy.baseURL?.trim() || meta.defaultBaseURL,
    models: [model],
    defaultModel: model,
  };
}

function profileMatchesLegacy(
  profile: LlmCustomProfile,
  legacy: LlmLocalProviderSecrets,
): boolean {
  const apiKey = legacy.apiKey?.trim();
  if (!apiKey || profile.apiKey.trim() !== apiKey) return false;
  const meta = getLlmProviderMeta(CUSTOM_PROVIDER_ID);
  const baseURL = legacy.baseURL?.trim() || meta.defaultBaseURL;
  if (profile.baseURL.trim() !== baseURL) return false;
  const model = legacy.model?.trim() || meta.defaultModel;
  return profile.models.includes(model);
}

function migrateLegacyDirectApiKey(secrets: LlmLocalSecrets): {
  secrets: LlmLocalSecrets;
  changed: boolean;
} {
  const directApiKey = secrets.directApiKey?.trim();
  if (!directApiKey) return { secrets, changed: false };

  const existing = secrets.providers[LLM_PROVIDER_ID]?.apiKey?.trim();
  if (existing) {
    if (secrets.directApiKey === directApiKey) {
      const next = { ...secrets };
      delete next.directApiKey;
      return { secrets: next, changed: true };
    }
    return { secrets, changed: false };
  }

  return {
    secrets: {
      ...secrets,
      directApiKey: undefined,
      providers: {
        ...secrets.providers,
        [LLM_PROVIDER_ID]: {
          ...secrets.providers[LLM_PROVIDER_ID],
          apiKey: directApiKey,
        },
      },
    },
    changed: true,
  };
}

function migrateLegacyCustomProviderToProfiles(secrets: LlmLocalSecrets): {
  secrets: LlmLocalSecrets;
  changed: boolean;
  importedProfileId?: string;
} {
  const legacy = secrets.providers[CUSTOM_PROVIDER_ID];
  if (!legacy?.apiKey?.trim()) {
    return { secrets, changed: false };
  }

  const profiles = [...(secrets.profiles ?? [])];
  const existing = profiles.find((profile) => profileMatchesLegacy(profile, legacy));
  if (existing) {
    const providers = { ...secrets.providers };
    delete providers[CUSTOM_PROVIDER_ID];
    return {
      secrets: { ...secrets, providers, profiles },
      changed: true,
      importedProfileId: existing.id,
    };
  }

  const profile = profileFromLegacyCustomProvider(
    legacy,
    profiles.length === 0 ? "Custom" : "Custom (imported)",
  );
  if (!profile) return { secrets, changed: false };

  const providers = { ...secrets.providers };
  delete providers[CUSTOM_PROVIDER_ID];

  return {
    secrets: {
      ...secrets,
      version: 2,
      providers,
      profiles: [...profiles, profile],
    },
    changed: true,
    importedProfileId: profile.id,
  };
}

function migrateLegacyCustomActiveSelection(
  secrets: LlmLocalSecrets,
  preferredProfileId?: string,
): { secrets: LlmLocalSecrets; changed: boolean } {
  const active = parseLlmSelection(secrets.activeSelection);
  if (active?.kind !== "builtin" || active.providerId !== CUSTOM_PROVIDER_ID) {
    return { secrets, changed: false };
  }

  const profiles = secrets.profiles ?? [];
  if (profiles.length === 0) return { secrets, changed: false };

  const profile =
    profiles.find((item) => item.id === preferredProfileId)
    ?? profiles[0]!;
  const modelId = resolveProfileDefaultModel(profile);

  return {
    secrets: {
      ...secrets,
      activeSelection: formatLlmSelection(
        profileSelection(profile.id, modelId),
      ),
    },
    changed: true,
  };
}

export function migrateLlmLocalSecrets(secrets: LlmLocalSecrets): {
  secrets: LlmLocalSecrets;
  changed: boolean;
} {
  let next = { ...secrets };
  let changed = false;

  const direct = migrateLegacyDirectApiKey(next);
  next = direct.secrets;
  changed ||= direct.changed;

  const custom = migrateLegacyCustomProviderToProfiles(next);
  next = custom.secrets;
  changed ||= custom.changed;

  const active = migrateLegacyCustomActiveSelection(next, custom.importedProfileId);
  next = active.secrets;
  changed ||= active.changed;

  if (next.version !== 2) {
    next = { ...next, version: 2 };
    changed = true;
  }

  return { secrets: next, changed };
}
