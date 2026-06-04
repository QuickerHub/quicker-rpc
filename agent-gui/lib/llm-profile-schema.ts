import { newRandomId } from "@/lib/new-id";
import {
  CUSTOM_PROVIDER_ID,
  getLlmProviderMeta,
} from "@/lib/llm-providers";

export type LlmCustomProfile = {
  id: string;
  title: string;
  description?: string;
  apiKey: string;
  baseURL: string;
  models: string[];
  defaultModel?: string;
  hidden?: boolean;
};

export type LlmCustomProfilePublic = Omit<LlmCustomProfile, "apiKey"> & {
  apiKey: {
    configured: boolean;
    masked?: string;
  };
};

export type LlmProfilePatch = {
  title?: string | null;
  description?: string | null;
  apiKey?: string | null;
  baseURL?: string | null;
  models?: string[] | null;
  defaultModel?: string | null;
  hidden?: boolean | null;
};

function normalizeModelList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const models: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    models.push(trimmed);
  }
  return models;
}

function normalizeProfile(raw: unknown): LlmCustomProfile | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const data = raw as Partial<LlmCustomProfile>;
  const id = typeof data.id === "string" ? data.id.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const apiKey = typeof data.apiKey === "string" ? data.apiKey.trim() : "";
  const baseURL = typeof data.baseURL === "string" ? data.baseURL.trim() : "";
  const models = normalizeModelList(data.models);
  if (!id || !title || !apiKey || !baseURL || models.length === 0) {
    return undefined;
  }
  const profile: LlmCustomProfile = { id, title, apiKey, baseURL, models };
  if (typeof data.description === "string" && data.description.trim()) {
    profile.description = data.description.trim();
  }
  const defaultModel =
    typeof data.defaultModel === "string" ? data.defaultModel.trim() : "";
  if (defaultModel && models.includes(defaultModel)) {
    profile.defaultModel = defaultModel;
  } else {
    profile.defaultModel = models[0];
  }
  if (data.hidden === true) profile.hidden = true;
  return profile;
}

export function normalizeProfiles(raw: unknown): LlmCustomProfile[] {
  if (!Array.isArray(raw)) return [];
  const profiles: LlmCustomProfile[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const profile = normalizeProfile(item);
    if (!profile || seen.has(profile.id)) continue;
    seen.add(profile.id);
    profiles.push(profile);
  }
  return profiles;
}

export function normalizeModelIds(raw: unknown): string[] {
  return normalizeModelList(raw);
}

type LegacyProviderSecrets = {
  apiKey?: string;
  baseURL?: string;
  model?: string;
};

type SecretsForMigration = {
  version?: number;
  providers: Record<string, LegacyProviderSecrets | undefined>;
  profiles?: LlmCustomProfile[];
};

/** Migrate legacy single custom provider entry into a profile (once). */
export function migrateLegacyCustomToProfile<T extends SecretsForMigration>(
  secrets: T,
): T {
  if (secrets.profiles?.length) return secrets;
  const legacy = secrets.providers[CUSTOM_PROVIDER_ID];
  if (!legacy?.apiKey?.trim()) return secrets;

  const meta = getLlmProviderMeta(CUSTOM_PROVIDER_ID);
  const model = legacy.model?.trim() || meta.defaultModel;
  const profile: LlmCustomProfile = {
    id: newRandomId(),
    title: "Custom",
    description: meta.description,
    apiKey: legacy.apiKey.trim(),
    baseURL: legacy.baseURL?.trim() || meta.defaultBaseURL,
    models: [model],
    defaultModel: model,
  };

  const providers = { ...secrets.providers };
  delete providers[CUSTOM_PROVIDER_ID];

  return {
    ...secrets,
    version: 2,
    providers,
    profiles: [profile],
  } as T;
}
