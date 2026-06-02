import type { LlmProviderId } from "@/lib/llm-providers";

/** Providers shown in the composer model menu (end-user surface). */
export const USER_MODEL_SELECTOR_IDS = [
  "bingleimuzi",
  "deepseek",
] as const satisfies readonly LlmProviderId[];

export type UserSettingsField = "apiKey" | "baseURL" | "model";

export type UserProviderUiSpec = {
  id: LlmProviderId;
  settingsFields: readonly UserSettingsField[];
};

/** Providers / fields exposed in the settings dialog (not llm-config.json). */
export const USER_PROVIDER_UI: readonly UserProviderUiSpec[] = [
  { id: "bingleimuzi", settingsFields: [] },
  { id: "deepseek", settingsFields: ["apiKey"] },
] as const;

export function isUserModelSelectorProvider(id: LlmProviderId): boolean {
  return (USER_MODEL_SELECTOR_IDS as readonly LlmProviderId[]).includes(id);
}

export function getUserProviderUiSpec(
  id: LlmProviderId,
): UserProviderUiSpec | undefined {
  return USER_PROVIDER_UI.find((spec) => spec.id === id);
}
