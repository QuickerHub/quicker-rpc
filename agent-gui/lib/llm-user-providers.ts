import type { LlmProviderId } from "@/lib/llm-providers";
import {
  DEEPSEEK_MODEL_OPTIONS,
  DEEPSEEK_PROVIDER_ID,
  LLM_PROVIDER_ID,
} from "@/lib/llm-providers";

/** Built-in presets shown in the composer model menu (custom endpoints use profiles). */
export const USER_MODEL_SELECTOR_IDS = [
  LLM_PROVIDER_ID,
  DEEPSEEK_PROVIDER_ID,
] as const satisfies readonly LlmProviderId[];

export type UserSettingsField = "apiKey" | "baseURL" | "model";

export type UserProviderUiSpec = {
  id: LlmProviderId;
  settingsFields: readonly UserSettingsField[];
};

/** Providers / fields exposed in the settings dialog (not llm-config.json). */
export const USER_PROVIDER_UI: readonly UserProviderUiSpec[] = [
  { id: LLM_PROVIDER_ID, settingsFields: [] },
  { id: DEEPSEEK_PROVIDER_ID, settingsFields: [] },
] as const;

/** Settings panel: providers the user can configure (excludes built-in defaults). */
export const USER_EDITABLE_PROVIDER_UI = USER_PROVIDER_UI.filter(
  (spec) => spec.settingsFields.length > 0,
) as readonly UserProviderUiSpec[];

export function isUserModelSelectorProvider(id: LlmProviderId): boolean {
  return (USER_MODEL_SELECTOR_IDS as readonly LlmProviderId[]).includes(id);
}

export function getUserProviderUiSpec(
  id: LlmProviderId,
): UserProviderUiSpec | undefined {
  return USER_PROVIDER_UI.find((spec) => spec.id === id);
}

export function getProviderModelOptions(
  id: LlmProviderId,
): readonly { id: string; label: string }[] | undefined {
  if (id === DEEPSEEK_PROVIDER_ID) return DEEPSEEK_MODEL_OPTIONS;
  return undefined;
}
