/** Lazy-start Node browser-runtime via Next API (dev + bundled QuickerAgent). */
export async function requestBrowserRuntimeStart(): Promise<boolean> {
  try {
    const res = await fetch("/api/browser/runtime", { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

/** @deprecated Use requestBrowserRuntimeStart */
export const requestDevBrowserRuntimeStart = requestBrowserRuntimeStart;
