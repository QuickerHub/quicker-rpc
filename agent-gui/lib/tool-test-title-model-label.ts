import type { LlmOptionsResponse } from "@/lib/llm-options-shared";
import { getModelPickerDisplay } from "@/lib/model-picker-display";
import { CUSTOM_PROVIDER_ID, parseLlmProviderId } from "@/lib/llm-providers";
import { parseLlmSelection } from "@/lib/llm-selection";

/** Human-readable model name for a stored selection string. */
export function resolveLlmSelectionLabel(
  selectionRaw: string,
  options: LlmOptionsResponse | null,
): string {
  const trimmed = selectionRaw.trim();
  if (!trimmed) return "未选择模型";

  const parsed = parseLlmSelection(trimmed);
  if (parsed?.kind === "profile" && options?.models) {
    const hit = options.models.find(
      (m) =>
        m.profileId === parsed.profileId && m.modelId === parsed.modelId,
    );
    if (hit) {
      return getModelPickerDisplay(
        hit.providerId ?? CUSTOM_PROVIDER_ID,
        hit.modelId,
        hit.label,
      ).displayName;
    }
    return `${parsed.profileId} / ${parsed.modelId}`;
  }

  const providerId = parseLlmProviderId(trimmed);
  if (providerId && options?.models) {
    const hit = options.models.find(
      (m) => (m.providerId ?? parseLlmProviderId(trimmed)) === providerId,
    );
    if (hit) {
      return getModelPickerDisplay(providerId, hit.modelId, hit.label).displayName;
    }
  }

  return trimmed;
}
