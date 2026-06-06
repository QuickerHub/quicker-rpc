/** Dev browser: lazy-start quicker-voice-runtime via Next API (not at pnpm dev boot). */
export async function requestDevVoiceRuntimeStart(): Promise<boolean> {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    const res = await fetch("/api/dev/voice-runtime", { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}
