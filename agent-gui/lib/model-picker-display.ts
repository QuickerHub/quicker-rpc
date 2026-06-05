import {
  CUSTOM_PROVIDER_ID,
  DEEPSEEK_PROVIDER_ID,
  formatModelShortLabel,
  getLlmProviderMeta,
  LLM_PROVIDER_ID,
  type LlmProviderId,
} from "@/lib/llm-providers";

export type ModelPickerTier = "Fast" | "Medium" | "High";

export type ModelPickerDisplay = {
  displayName: string;
  tier: ModelPickerTier;
};

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

function humanizeModelId(modelId: string): string {
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

export function getModelPickerDisplay(
  providerId: LlmProviderId,
  modelId: string,
  profileTitle?: string,
): ModelPickerDisplay {
  if (profileTitle?.trim()) {
    return {
      displayName: profileTitle.trim(),
      tier: "Medium",
    };
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
