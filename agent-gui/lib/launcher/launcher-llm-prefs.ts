"use client";

export const LAUNCHER_LLM_SELECTION_STORAGE_KEY = "launcher-llm-selection";

export function loadLauncherLlmSelectionRaw(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem(LAUNCHER_LLM_SELECTION_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeLauncherLlmSelectionRaw(selection: string): void {
  try {
    localStorage.setItem(LAUNCHER_LLM_SELECTION_STORAGE_KEY, selection);
  } catch {
    /* ignore */
  }
}
