import {
  CUSTOM_PROVIDER_ID,
  getLlmProviderMeta,
  LLM_PROVIDER_ID,
  type LlmProviderId,
} from "@/lib/llm-providers";
import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import { getLocalDirectApiKey } from "@/lib/llm-local-secrets";
import { isLlmProviderHidden } from "@/lib/llm-config";
import {
  getStoredActiveSelection,
  listProfileModelOptions,
} from "@/lib/llm-profiles";
import { formatLlmSelection } from "@/lib/llm-selection";
import { USER_MODEL_SELECTOR_IDS } from "@/lib/llm-user-providers";
import {
  getChatModelId,
  getLlmProviderId,
  isLlmProviderConfigured,
  isLlmSelectionConfigured,
  resolveLlmConfig,
} from "@/lib/llm";
import type { LlmModelOption, LlmOptionsResponse } from "@/lib/llm-options-shared";

export type { LlmModelOption, LlmOptionsResponse } from "@/lib/llm-options-shared";
export {
  findLlmModelOption,
  pickInitialLlmSelection,
} from "@/lib/llm-options-shared";

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

function builtinOptions(): LlmModelOption[] {
  const options: LlmModelOption[] = [];
  for (const id of USER_MODEL_SELECTOR_IDS) {
    if (isLlmProviderHidden(id)) continue;
    const meta = getLlmProviderMeta(id);
    const modelId = envModelForProvider(id);
    options.push({
      selection: formatLlmSelection({ kind: "builtin", providerId: id }),
      kind: "builtin",
      providerId: id,
      label: meta.label,
      description: meta.description,
      modelId,
      configured: isLlmProviderConfigured(id),
      ...contextLimitForModel(modelId, id),
    });
  }
  return options;
}

function profileOptions(): LlmModelOption[] {
  return listProfileModelOptions().map((item) => ({
    selection: item.selection,
    kind: "profile" as const,
    profileId: item.profileId,
    label: item.title,
    title: item.title,
    description: item.description,
    modelId: item.modelId,
    configured: item.configured,
    ...contextLimitForModel(item.modelId, CUSTOM_PROVIDER_ID),
  }));
}

export function buildLlmModelOptions(): LlmModelOption[] {
  return [...builtinOptions(), ...profileOptions()];
}

export function pickDefaultSelection(options: LlmModelOption[]): string {
  const openAi = options.find(
    (o) =>
      o.kind === "builtin"
      && o.providerId === LLM_PROVIDER_ID
      && o.configured,
  );
  if (openAi) return openAi.selection;

  const defaultProvider = getLlmProviderId();
  const builtinDefault = options.find(
    (o) => o.kind === "builtin" && o.providerId === defaultProvider && o.configured,
  );
  if (builtinDefault) return builtinDefault.selection;

  const firstConfigured = options.find((o) => o.configured);
  if (firstConfigured) return firstConfigured.selection;

  return options[0]?.selection ?? formatLlmSelection({
    kind: "builtin",
    providerId: defaultProvider,
  });
}

export function pickActiveSelection(options: LlmModelOption[]): string {
  const stored = getStoredActiveSelection();
  if (stored && isLlmSelectionConfigured(stored)) {
    const key = formatLlmSelection(stored);
    if (options.some((o) => o.selection === key && o.configured)) {
      return key;
    }
  }

  try {
    const resolved = resolveLlmConfig().providerId;
    const match = options.find(
      (o) => o.kind === "builtin" && o.providerId === resolved && o.configured,
    );
    if (match) return match.selection;
  } catch {
    /* ignore */
  }

  return pickDefaultSelection(options);
}

export function buildLlmOptionsResponse(): LlmOptionsResponse {
  const options = buildLlmModelOptions();
  const defaultSelection = pickDefaultSelection(options);
  const activeSelection = pickActiveSelection(options);
  return {
    defaultSelection,
    activeSelection,
    options,
    directOverride: Boolean(
      getLocalDirectApiKey() || process.env.LLM_API_KEY?.trim(),
    ),
  };
}
