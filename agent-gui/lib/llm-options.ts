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
  listProfilePickerOptions,
} from "@/lib/llm-profiles";
import { formatLlmSelection } from "@/lib/llm-selection";
import { buildAutoModelOption } from "@/lib/llm-auto";
import { USER_MODEL_SELECTOR_IDS } from "@/lib/llm-user-providers";
import {
  getChatModelId,
  getLlmProviderId,
  isLlmProviderConfigured,
  isLlmSelectionConfigured,
  resolveLlmConfig,
  resolveLlmEndpointChain,
} from "@/lib/llm";
import { resolveAutoLlmEndpoint } from "@/lib/llm-auto";
import { listBuiltinGroupDisplayRows } from "@/lib/llm-builtin-display";
import type { LlmModelOption, LlmOptionsResponse } from "@/lib/llm-options-shared";
import { optionMatchesSelection } from "@/lib/llm-options-shared";

export type { LlmModelOption, LlmOptionsResponse } from "@/lib/llm-options-shared";
export {
  findLlmModelOption,
  pickInitialLlmSelection,
  pickInitialLauncherLlmSelection,
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

function resolvedBaseURLForBuiltin(providerId: LlmProviderId): string | undefined {
  if (!isLlmProviderConfigured(providerId)) return undefined;
  try {
    return resolveLlmEndpointChain(providerId)[0]?.baseURL;
  } catch {
    return undefined;
  }
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
      baseURL: resolvedBaseURLForBuiltin(id),
      ...contextLimitForModel(modelId, id),
    });
  }
  return options;
}

function profileOptions(): LlmModelOption[] {
  return listProfilePickerOptions().map((item) => ({
    selection: item.selection,
    kind: "profile" as const,
    profileId: item.profileId,
    profileModels: item.models,
    label: item.title,
    title: item.title,
    description: item.description,
    modelId: item.modelId,
    configured: item.configured,
    baseURL: item.baseURL,
    ...contextLimitForModel(item.modelId, CUSTOM_PROVIDER_ID),
  }));
}

function attachBuiltinGroupMetadata(options: LlmModelOption[]): LlmModelOption[] {
  const groups = listBuiltinGroupDisplayRows();
  return options.map((option) => {
    if (option.kind === "builtin" && option.providerId) {
      const group = groups.find(
        (row) => row.kind === "builtin" && row.providerId === option.providerId,
      );
      if (!group?.endpoints.length) return option;
      const activeEndpoint = group.endpoints.find((entry) => entry.selected)
        ?? group.endpoints[0];
      return {
        ...option,
        builtinGroupId: group.id,
        endpoints: group.endpoints.map((endpoint) => ({
          id: endpoint.id,
          baseURL: endpoint.baseURL,
          model: endpoint.model,
          selected: endpoint.selected,
        })),
        baseURL: activeEndpoint?.baseURL ?? option.baseURL,
      };
    }
    if (option.kind === "auto") {
      const group = groups.find((row) => row.kind === "auto");
      if (!group) return option;
      const activeModel = group.autoModels?.find((entry) => entry.selected)
        ?? group.autoModels?.[0];
      return {
        ...option,
        builtinGroupId: group.id,
        baseURL: group.primaryBaseURL ?? option.baseURL,
        autoModels: group.autoModels?.map((model) => ({
          id: model.id,
          modelId: model.modelId,
          label: model.label,
          contextLimitLabel: model.contextLimitLabel,
          selected: model.selected,
        })),
        modelId: activeModel?.modelId ?? option.modelId,
      };
    }
    return option;
  });
}

export function buildLlmModelOptions(): LlmModelOption[] {
  const auto = buildAutoModelOption();
  const rest = [...builtinOptions(), ...profileOptions()];
  const merged = auto ? [auto, ...rest] : rest;
  return attachBuiltinGroupMetadata(merged);
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
    if (options.some((o) => optionMatchesSelection(o, key) && o.configured)) {
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
