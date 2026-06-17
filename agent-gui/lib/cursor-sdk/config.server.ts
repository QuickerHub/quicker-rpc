import "server-only";

export const CURSOR_SDK_DEFAULT_MODEL = "auto" as const;

export const CURSOR_SDK_MODEL_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "composer-2.5", label: "Composer 2.5" },
] as const;

export function resolveCursorSdkApiKey(): string | undefined {
  return process.env.CURSOR_API_KEY?.trim() || undefined;
}

export function requireCursorSdkApiKey(): string {
  const key = resolveCursorSdkApiKey();
  if (!key) {
    throw new Error(
      "CURSOR_API_KEY is not set. Add it in Cursor Dashboard → Integrations.",
    );
  }
  return key;
}

export function defaultCursorSdkModelId(): string {
  return process.env.CURSOR_SDK_MODEL?.trim() || CURSOR_SDK_DEFAULT_MODEL;
}
