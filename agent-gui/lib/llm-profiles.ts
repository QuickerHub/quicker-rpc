import { newRandomId } from "@/lib/new-id";
import {
  loadLlmLocalSecrets,
  maskSecret,
  saveLlmLocalSecrets,
} from "@/lib/llm-local-secrets";
import {
  normalizeModelIds,
  type LlmCustomProfile,
  type LlmCustomProfilePublic,
  type LlmProfilePatch,
} from "@/lib/llm-profile-schema";
export type {
  LlmCustomProfile,
  LlmCustomProfilePublic,
  LlmProfilePatch,
} from "@/lib/llm-profile-schema";
import type { LlmSelection } from "@/lib/llm-selection";
import {
  formatLlmSelection,
  parseLlmSelection,
  profileSelection,
} from "@/lib/llm-selection";

export type LlmProfileModelOption = {
  selection: string;
  profileId: string;
  modelId: string;
  title: string;
  description: string;
  configured: boolean;
};

function normalizeModelList(raw: unknown): string[] {
  return normalizeModelIds(raw);
}

export function listCustomProfiles(): LlmCustomProfile[] {
  const secrets = loadLlmLocalSecrets();
  return (secrets.profiles ?? []).filter((p) => !p.hidden);
}

export function listAllCustomProfiles(): LlmCustomProfile[] {
  return loadLlmLocalSecrets().profiles ?? [];
}

export function getCustomProfile(id: string): LlmCustomProfile | undefined {
  const trimmed = id.trim();
  if (!trimmed) return undefined;
  return listAllCustomProfiles().find((p) => p.id === trimmed);
}

export function resolveProfileDefaultModel(profile: LlmCustomProfile): string {
  const preferred = profile.defaultModel?.trim();
  if (preferred && profile.models.includes(preferred)) return preferred;
  return profile.models[0]!;
}

export function isCustomProfileConfigured(profile: LlmCustomProfile): boolean {
  return Boolean(
    profile.apiKey.trim()
    && profile.baseURL.trim()
    && profile.models.length > 0,
  );
}

export function toPublicProfile(profile: LlmCustomProfile): LlmCustomProfilePublic {
  return {
    id: profile.id,
    title: profile.title,
    description: profile.description,
    baseURL: profile.baseURL,
    models: [...profile.models],
    defaultModel: resolveProfileDefaultModel(profile),
    hidden: profile.hidden,
    apiKey: {
      configured: Boolean(profile.apiKey.trim()),
      masked: profile.apiKey.trim() ? maskSecret(profile.apiKey) : undefined,
    },
  };
}

export function listProfileModelOptions(): LlmProfileModelOption[] {
  const options: LlmProfileModelOption[] = [];
  for (const profile of listCustomProfiles()) {
    const configured = isCustomProfileConfigured(profile);
    const description = profile.description?.trim() || profile.baseURL;
    for (const modelId of profile.models) {
      const selection = formatLlmSelection(profileSelection(profile.id, modelId));
      options.push({
        selection,
        profileId: profile.id,
        modelId,
        title: profile.title,
        description,
        configured,
      });
    }
  }
  return options;
}

export function resolveProfileSelection(
  profileId: string,
  modelId: string,
): { profile: LlmCustomProfile; modelId: string } | undefined {
  const profile = getCustomProfile(profileId);
  if (!profile || profile.hidden) return undefined;
  const trimmedModel = modelId.trim();
  if (!trimmedModel || !profile.models.includes(trimmedModel)) {
    return undefined;
  }
  return { profile, modelId: trimmedModel };
}

export function getStoredActiveSelection(): LlmSelection | undefined {
  const raw = loadLlmLocalSecrets().activeSelection;
  return parseLlmSelection(raw);
}

export function setStoredActiveSelection(selection: LlmSelection | undefined): void {
  const current = loadLlmLocalSecrets();
  saveLlmLocalSecrets({
    ...current,
    activeSelection: selection ? formatLlmSelection(selection) : undefined,
  });
}

/** Display name when the user skips title during quick profile setup. */
export function deriveProfileTitle(input: {
  baseURL: string;
  models: string[];
  existingTitles?: readonly string[];
}): string {
  const model = input.models[0]?.trim();
  let host = "";
  try {
    host = new URL(input.baseURL.trim()).hostname.replace(/^www\./i, "");
  } catch {
    // ignore invalid URL until baseURL validation runs
  }

  let title = model || host || "自定义配置";
  const used = new Set(
    (input.existingTitles ?? [])
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!used.has(title.toLowerCase())) return title;

  let suffix = 2;
  while (used.has(`${title} ${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${title} ${suffix}`;
}

export function createCustomProfile(input: {
  title?: string;
  apiKey: string;
  baseURL: string;
  models: string[];
  description?: string;
  defaultModel?: string;
  hidden?: boolean;
}): LlmCustomProfile {
  const apiKey = input.apiKey.trim();
  const baseURL = input.baseURL.trim();
  const models = normalizeModelList(input.models);
  const secrets = loadLlmLocalSecrets();
  const title = input.title?.trim()
    || deriveProfileTitle({
      baseURL,
      models,
      existingTitles: (secrets.profiles ?? []).map((profile) => profile.title),
    });
  if (!apiKey) throw new Error("Profile apiKey is required");
  if (!baseURL) throw new Error("Profile baseURL is required");
  if (models.length === 0) throw new Error("Profile models must not be empty");

  const profile: LlmCustomProfile = {
    id: newRandomId(),
    title,
    apiKey,
    baseURL,
    models,
  };
  if (input.description?.trim()) profile.description = input.description.trim();
  const defaultModel = input.defaultModel?.trim();
  if (defaultModel && models.includes(defaultModel)) {
    profile.defaultModel = defaultModel;
  } else {
    profile.defaultModel = models[0];
  }
  if (input.hidden === true) profile.hidden = true;

  saveLlmLocalSecrets({
    ...secrets,
    version: 2,
    profiles: [...(secrets.profiles ?? []), profile],
  });
  return profile;
}

export function updateCustomProfile(
  id: string,
  patch: LlmProfilePatch,
): LlmCustomProfile {
  const current = loadLlmLocalSecrets();
  const profiles = [...(current.profiles ?? [])];
  const index = profiles.findIndex((p) => p.id === id.trim());
  if (index < 0) throw new Error(`Profile not found: ${id}`);

  const prev = profiles[index]!;
  const next: LlmCustomProfile = { ...prev };

  if (patch.title !== undefined) {
    const title = patch.title?.trim() ?? "";
    next.title = title || deriveProfileTitle({
      baseURL: next.baseURL,
      models: next.models,
      existingTitles: profiles
        .filter((_, itemIndex) => itemIndex !== index)
        .map((profile) => profile.title),
    });
  }
  if (patch.description !== undefined) {
    const desc = patch.description?.trim() ?? "";
    if (desc) next.description = desc;
    else delete next.description;
  }
  if (patch.apiKey !== undefined) {
    const apiKey = patch.apiKey?.trim() ?? "";
    if (!apiKey) throw new Error("Profile apiKey cannot be empty");
    next.apiKey = apiKey;
  }
  if (patch.baseURL !== undefined) {
    const baseURL = patch.baseURL?.trim() ?? "";
    if (!baseURL) throw new Error("Profile baseURL cannot be empty");
    next.baseURL = baseURL;
  }
  if (patch.models !== undefined) {
    const models = normalizeModelList(patch.models);
    if (models.length === 0) throw new Error("Profile models must not be empty");
    next.models = models;
    const defaultModel = next.defaultModel?.trim();
    if (!defaultModel || !models.includes(defaultModel)) {
      next.defaultModel = models[0];
    }
  }
  if (patch.defaultModel !== undefined) {
    const defaultModel = patch.defaultModel?.trim() ?? "";
    if (!defaultModel || !next.models.includes(defaultModel)) {
      throw new Error(`defaultModel must be one of: ${next.models.join(", ")}`);
    }
    next.defaultModel = defaultModel;
  }
  if (patch.hidden !== undefined) {
    if (patch.hidden === true) next.hidden = true;
    else delete next.hidden;
  }

  profiles[index] = next;
  saveLlmLocalSecrets({ ...current, version: 2, profiles });
  return next;
}

export function deleteCustomProfile(id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed) return false;
  const current = loadLlmLocalSecrets();
  const profiles = (current.profiles ?? []).filter((p) => p.id !== trimmed);
  if (profiles.length === (current.profiles ?? []).length) return false;

  let activeSelection = current.activeSelection;
  const active = parseLlmSelection(activeSelection);
  if (active?.kind === "profile" && active.profileId === trimmed) {
    activeSelection = undefined;
  }

  saveLlmLocalSecrets({
    ...current,
    version: 2,
    profiles,
    activeSelection,
  });
  return true;
}
