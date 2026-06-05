import {
  CUSTOM_PROVIDER_ID,
  DEEPSEEK_PROVIDER_ID,
  LLM_PROVIDER_ID,
  parseLlmProviderId,
  type LlmProviderId,
} from "@/lib/llm-providers";

/** Built-in preset or a user-defined custom profile + model. */
export type LlmBuiltinSelection = {
  kind: "builtin";
  providerId: LlmProviderId;
};

export type LlmProfileSelection = {
  kind: "profile";
  profileId: string;
  modelId: string;
};

export type LlmAutoSelection = {
  kind: "auto";
};

export type LlmSelection =
  | LlmBuiltinSelection
  | LlmProfileSelection
  | LlmAutoSelection;

export const LLM_AUTO_SELECTION = "auto" as const;

export { LLM_AUTO_LABEL } from "@/lib/llm-auto";

export const LLM_SELECTION_STORAGE_KEY = "agent-gui-llm-selection";

const BUILTIN_PROVIDER_IDS = new Set<LlmProviderId>([
  LLM_PROVIDER_ID,
  DEEPSEEK_PROVIDER_ID,
  CUSTOM_PROVIDER_ID,
]);

export function isBuiltinProviderId(id: string): id is LlmProviderId {
  return BUILTIN_PROVIDER_IDS.has(id as LlmProviderId);
}

/** Serialize selection for API / localStorage. */
export function formatLlmSelection(selection: LlmSelection): string {
  if (selection.kind === "auto") {
    return LLM_AUTO_SELECTION;
  }
  if (selection.kind === "builtin") {
    return selection.providerId;
  }
  return `profile:${selection.profileId}/${encodeURIComponent(selection.modelId)}`;
}

export function isAutoLlmSelectionRaw(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === LLM_AUTO_SELECTION;
}

/** Parse stored/API selection string (backward compatible with legacy provider ids). */
export function parseLlmSelection(raw: string | undefined): LlmSelection | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;

  if (isAutoLlmSelectionRaw(trimmed)) {
    return { kind: "auto" };
  }

  if (trimmed.startsWith("profile:")) {
    const body = trimmed.slice("profile:".length);
    const slash = body.indexOf("/");
    if (slash <= 0) return undefined;
    const profileId = body.slice(0, slash).trim();
    const modelRaw = body.slice(slash + 1).trim();
    if (!profileId || !modelRaw) return undefined;
    let modelId: string;
    try {
      modelId = decodeURIComponent(modelRaw);
    } catch {
      modelId = modelRaw;
    }
    return { kind: "profile", profileId, modelId };
  }

  const providerId = parseLlmProviderId(trimmed);
  if (!providerId) return undefined;
  return { kind: "builtin", providerId };
}

export function selectionEquals(a: LlmSelection, b: LlmSelection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "auto" && b.kind === "auto") {
    return true;
  }
  if (a.kind === "builtin" && b.kind === "builtin") {
    return a.providerId === b.providerId;
  }
  if (a.kind === "profile" && b.kind === "profile") {
    return a.profileId === b.profileId && a.modelId === b.modelId;
  }
  return false;
}

export function builtinSelection(
  providerId: LlmProviderId = LLM_PROVIDER_ID,
): LlmBuiltinSelection {
  return { kind: "builtin", providerId };
}

export function profileSelection(
  profileId: string,
  modelId: string,
): LlmProfileSelection {
  return { kind: "profile", profileId, modelId };
}

/** Legacy helper: extract provider id when selection is builtin-only. */
export function selectionToLegacyProviderId(
  selection: LlmSelection | undefined,
): LlmProviderId | undefined {
  if (!selection) return undefined;
  if (selection.kind === "auto") return CUSTOM_PROVIDER_ID;
  if (selection.kind === "builtin") return selection.providerId;
  return CUSTOM_PROVIDER_ID;
}
