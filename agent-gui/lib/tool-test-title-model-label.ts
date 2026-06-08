import type { LlmOptionsResponse } from "@/lib/llm-options-shared";
import { getModelPickerDisplay, getProfilePickerDisplay } from "@/lib/model-picker-display";
import { CUSTOM_PROVIDER_ID, parseLlmProviderId } from "@/lib/llm-providers";
import { LLM_AUTO_LABEL, LLM_AUTO_SELECTION, parseLlmSelection } from "@/lib/llm-selection";

/** Human-readable model name for a stored selection string. */
export function resolveLlmSelectionLabel(
  selectionRaw: string,
  options: LlmOptionsResponse | null,
): string {
  const trimmed = selectionRaw.trim();
  if (!trimmed) return "未选择模型";

  const parsed = parseLlmSelection(trimmed);
  const optionList = options?.options;

  if (parsed?.kind === "auto") {
    const hit = optionList?.find((o) => o.selection === LLM_AUTO_SELECTION);
    return hit?.label ?? LLM_AUTO_LABEL;
  }

  if (parsed?.kind === "profile" && optionList) {
    const hit = optionList.find(
      (m) =>
        m.kind === "profile"
        && m.profileId === parsed.profileId,
    );
    if (hit) {
      const modelId = hit.profileModels?.includes(parsed.modelId)
        ? parsed.modelId
        : hit.modelId;
      return getProfilePickerDisplay(hit.label, modelId).displayName;
    }
    return `${parsed.profileId} / ${parsed.modelId}`;
  }

  const providerId = parseLlmProviderId(trimmed);
  if (providerId && optionList) {
    const hit = optionList.find(
      (m) => (m.providerId ?? parseLlmProviderId(trimmed)) === providerId,
    );
    if (hit) {
      return getModelPickerDisplay(providerId, hit.modelId, hit.label).displayName;
    }
  }

  return trimmed;
}
