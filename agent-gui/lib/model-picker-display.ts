import {
  CUSTOM_PROVIDER_ID,
  DEEPSEEK_PROVIDER_ID,
  formatModelShortLabel,
  getLlmProviderMeta,
  LLM_PROVIDER_ID,
  type LlmProviderId,
} from "@/lib/llm-providers";
import {
  LLM_PROFILE_TITLE_PLACEHOLDER,
  resolveProfileDisplayTitle,
} from "@/lib/llm-profile-schema";

export type ModelPickerTier = "Fast" | "Medium" | "High";

export type ModelPickerDisplay = {
  displayName: string;
  /** Tier label, or humanized model id for profile rows. */
  tier: ModelPickerTier | string;
};

/** Compact labels for the composer model-picker trigger button. */
export type ModelPickerTriggerDisplay = {
  title: string;
  shortModel: string;
};

export function formatModelTriggerShortLabel(modelId: string): string {
  const tail = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  if (/^gpt-[\d.]+$/i.test(tail)) {
    return tail.replace(/^gpt-/i, "GPT-");
  }
  if (/^deepseek-/i.test(tail)) {
    return tail
      .slice("deepseek-".length)
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return formatModelShortLabel(modelId);
}

export function getModelPickerTriggerDisplay(input: {
  kind: "builtin" | "profile" | "auto";
  providerId?: LlmProviderId;
  modelId: string;
  label: string;
  profileTitle?: string;
  title?: string;
}): ModelPickerTriggerDisplay {
  const shortModel = formatModelTriggerShortLabel(input.modelId);

  if (input.kind === "auto") {
    return { title: input.label, shortModel };
  }

  if (input.kind === "profile") {
    const rawTitle = input.profileTitle?.trim() ?? "";
    const displayTitle = resolveProfileDisplayTitle(rawTitle);
    return {
      title: displayTitle,
      shortModel: rawTitle || displayTitle !== LLM_PROFILE_TITLE_PLACEHOLDER
        ? shortModel
        : "",
    };
  }

  const providerId = input.providerId ?? CUSTOM_PROVIDER_ID;
  if (providerId === CUSTOM_PROVIDER_ID) {
    return { title: shortModel, shortModel: "" };
  }

  const meta = getLlmProviderMeta(providerId);
  return { title: meta.label, shortModel };
}

export function shouldShowModelPickerTriggerShortModel(
  display: ModelPickerTriggerDisplay,
): boolean {
  const short = display.shortModel.trim();
  if (!short) return false;
  return short.toLowerCase() !== display.title.trim().toLowerCase();
}

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    const text = m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1).replace(/\.0$/, "")}M`;
    return `${text} context window`;
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}k context window`;
  }
  return `${tokens} context window`;
}

export function humanizeModelId(modelId: string): string {
  const tail = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  if (/^gpt-[\d.]+$/i.test(tail)) {
    return tail.replace(/^gpt-/i, "GPT-");
  }
  if (/^deepseek-/i.test(tail)) {
    return tail
      .split("-")
      .map((part, i) =>
        i === 0 ? "DeepSeek" : part.charAt(0).toUpperCase() + part.slice(1),
      )
      .join(" ");
  }
  return formatModelShortLabel(modelId);
}

/** Profile row: title on the first line, active model on the second. */
export function getProfilePickerDisplay(
  profileTitle: string,
  modelId: string,
): ModelPickerDisplay {
  const title = profileTitle.trim();
  const modelLabel = humanizeModelId(modelId);
  const displayName = title || resolveProfileDisplayTitle(title);
  return {
    displayName,
    tier: modelLabel,
  };
}

export function getModelPickerDisplay(
  providerId: LlmProviderId,
  modelId: string,
  profileTitle?: string,
): ModelPickerDisplay {
  if (profileTitle?.trim()) {
    return getProfilePickerDisplay(profileTitle, modelId);
  }
  const meta = getLlmProviderMeta(providerId);
  if (providerId === CUSTOM_PROVIDER_ID) {
    return {
      displayName: humanizeModelId(modelId),
      tier: "Medium",
    };
  }
  if (providerId === DEEPSEEK_PROVIDER_ID) {
    const displayName = humanizeModelId(modelId);
    const tier: ModelPickerTier = /pro/i.test(modelId) ? "High" : "Fast";
    return { displayName, tier };
  }
  if (providerId === LLM_PROVIDER_ID) {
    const displayName = humanizeModelId(modelId) || "GPT-5.5";
    const tier: ModelPickerTier = "Medium";
    return { displayName, tier };
  }
  const displayName = humanizeModelId(modelId) || meta.label;
  const tier: ModelPickerTier = "Medium";
  return { displayName, tier };
}

export function matchesModelPickerQuery(
  query: string,
  parts: {
    displayName: string;
    tier: string;
    modelId: string;
    label: string;
    description: string;
  },
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    parts.displayName,
    parts.tier,
    parts.modelId,
    parts.label,
    parts.description,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
