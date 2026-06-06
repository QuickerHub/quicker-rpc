/** Dev browser: lazy-start Node browser-runtime via Next API. */
export async function requestDevBrowserRuntimeStart(): Promise<boolean> {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    const res = await fetch("/api/dev/browser-runtime", { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}
