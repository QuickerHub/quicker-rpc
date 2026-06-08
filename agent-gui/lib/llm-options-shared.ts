import type { LlmProviderId } from "@/lib/llm-providers";
import { LLM_PROVIDER_ID } from "@/lib/llm-providers";
import { parseLlmSelection, LLM_AUTO_SELECTION } from "@/lib/llm-selection";
export type LlmPickerEndpointOption = {
  id: string;
  baseURL: string;
  model: string;
  selected: boolean;
};

export type LlmPickerAutoModelOption = {
  id: string;
  modelId: string;
  label: string;
  contextLimitLabel: string;
  selected: boolean;
};

/** Client-safe LLM picker types (no fs/crypto imports). */
export type LlmModelOption = {
  selection: string;
  kind: "builtin" | "profile" | "auto";
  providerId?: LlmProviderId;
  profileId?: string;
  /** Built-in publish group id (gpt55, deepseek, nvidia, …). */
  builtinGroupId?: string;
  /** Models available under a custom profile row. */
  profileModels?: string[];
  label: string;
  title?: string;
  description: string;
  modelId: string;
  configured: boolean;
  /** Resolved primary endpoint base URL (dev / settings). */
  baseURL?: string;
  /** Switchable endpoints for built-in presets. */
  endpoints?: LlmPickerEndpointOption[];
  /** Switchable Auto (NVIDIA NIM) model candidates. */
  autoModels?: LlmPickerAutoModelOption[];
  contextLimit: number;
  contextLimitSource?: "env" | "catalog" | "pattern" | "default";
};

export function optionMatchesSelection(
  option: LlmModelOption,
  selectionRaw: string,
): boolean {
  if (option.selection === selectionRaw) return true;
  const parsed = parseLlmSelection(selectionRaw);
  if (parsed?.kind === "profile" && option.kind === "profile") {
    return (
      option.profileId === parsed.profileId
      && Boolean(option.profileModels?.includes(parsed.modelId))
    );
  }
  return false;
}

export function resolveActiveModelIdForOption(
  option: LlmModelOption,
  selectionRaw: string,
): string {
  const parsed = parseLlmSelection(selectionRaw);
  if (
    parsed?.kind === "profile"
    && option.kind === "profile"
    && option.profileId === parsed.profileId
    && option.profileModels?.includes(parsed.modelId)
  ) {
    return parsed.modelId;
  }
  return option.modelId;
}

export type LlmOptionsResponse = {
  defaultSelection: string;
  activeSelection: string;
  options: LlmModelOption[];
  directOverride: boolean;
};

export function pickInitialLlmSelection(
  data: LlmOptionsResponse,
  storedRaw: string | undefined,
): string {
  const configured = data.options.filter((o) => o.configured);

  // Agent composer: restore last browser choice before server defaults.
  if (storedRaw && configured.some((o) => optionMatchesSelection(o, storedRaw))) {
    return storedRaw;
  }

  const parsed = parseLlmSelection(storedRaw);
  if (parsed?.kind === "builtin") {
    const legacy = configured.find(
      (o) => o.kind === "builtin" && o.providerId === parsed.providerId,
    );
    if (legacy) return legacy.selection;
  }

  const gpt55 = configured.find(
    (o) => o.kind === "builtin" && o.providerId === LLM_PROVIDER_ID,
  );
  if (gpt55) return gpt55.selection;

  if (
    data.activeSelection
    && configured.some((o) => optionMatchesSelection(o, data.activeSelection))
  ) {
    return data.activeSelection;
  }

  if (
    data.defaultSelection
    && configured.some((o) => optionMatchesSelection(o, data.defaultSelection))
  ) {
    return data.defaultSelection;
  }

  return configured[0]?.selection ?? data.defaultSelection;
}

/** Launcher composer: prefer stored launcher choice, else Auto, else GPT-5.5. */
export function pickInitialLauncherLlmSelection(
  data: LlmOptionsResponse,
  storedRaw: string | undefined,
): string {
  const configured = data.options.filter((o) => o.configured);

  if (storedRaw && configured.some((o) => optionMatchesSelection(o, storedRaw))) {
    return storedRaw;
  }

  const auto = configured.find((o) => o.selection === LLM_AUTO_SELECTION);
  if (auto) return auto.selection;

  const openAi = configured.find(
    (o) =>
      o.kind === "builtin"
      && o.providerId === LLM_PROVIDER_ID
      && o.configured,
  );
  if (openAi) return openAi.selection;

  return configured[0]?.selection ?? data.defaultSelection;
}

export function findLlmModelOption(
  options: LlmModelOption[],
  selection: string,
): LlmModelOption | undefined {
  const match = options.find((o) => optionMatchesSelection(o, selection));
  if (!match) return undefined;
  const parsed = parseLlmSelection(selection);
  if (parsed?.kind === "profile" && match.kind === "profile") {
    return { ...match, modelId: parsed.modelId, selection };
  }
  return match;
}
