export const CURSOR_SDK_SESSION_STORAGE_KEY = "cursor-sdk-session-id";
export const CURSOR_SDK_MODEL_STORAGE_KEY = "cursor-sdk-model";

export function loadStoredCursorSdkSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CURSOR_SDK_SESSION_STORAGE_KEY)?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function storeCursorSdkSessionId(sessionId: string): void {
  try {
    sessionStorage.setItem(CURSOR_SDK_SESSION_STORAGE_KEY, sessionId);
  } catch {
    /* ignore */
  }
}

export function clearStoredCursorSdkSessionId(): void {
  try {
    sessionStorage.removeItem(CURSOR_SDK_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadStoredCursorSdkModel(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CURSOR_SDK_MODEL_STORAGE_KEY)?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function storeCursorSdkModel(modelId: string): void {
  try {
    localStorage.setItem(CURSOR_SDK_MODEL_STORAGE_KEY, modelId);
  } catch {
    /* ignore */
  }
}
