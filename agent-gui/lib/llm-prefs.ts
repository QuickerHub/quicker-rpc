import type { LlmProviderId } from "@/lib/llm-providers";
import {
  formatLlmSelection,
  LLM_SELECTION_STORAGE_KEY,
  parseLlmSelection,
  selectionToLegacyProviderId,
  type LlmSelection,
} from "@/lib/llm-selection";

/** @deprecated use LLM_SELECTION_STORAGE_KEY */
export const LLM_PROVIDER_STORAGE_KEY = LLM_SELECTION_STORAGE_KEY;

export function loadStoredLlmSelection(): LlmSelection | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw =
      localStorage.getItem(LLM_SELECTION_STORAGE_KEY)
      ?? localStorage.getItem("agent-gui-llm-provider");
    return parseLlmSelection(raw ?? undefined);
  } catch {
    return undefined;
  }
}

export function storeLlmSelection(selection: LlmSelection): void {
  try {
    localStorage.setItem(
      LLM_SELECTION_STORAGE_KEY,
      formatLlmSelection(selection),
    );
  } catch {
    /* ignore */
  }
}

/** @deprecated use loadStoredLlmSelection */
export function loadStoredLlmProvider(): LlmProviderId | undefined {
  return selectionToLegacyProviderId(loadStoredLlmSelection());
}

/** @deprecated use storeLlmSelection */
export function storeLlmProvider(id: LlmProviderId): void {
  storeLlmSelection({ kind: "builtin", providerId: id });
}

export function loadStoredLlmSelectionRaw(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return (
      localStorage.getItem(LLM_SELECTION_STORAGE_KEY)
      ?? localStorage.getItem("agent-gui-llm-provider")
      ?? undefined
    );
  } catch {
    return undefined;
  }
}

export function storeLlmSelectionRaw(selection: string): void {
  try {
    localStorage.setItem(LLM_SELECTION_STORAGE_KEY, selection);
  } catch {
    /* ignore */
  }
}
