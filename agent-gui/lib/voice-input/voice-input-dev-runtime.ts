/** Dev browser: start/stop quicker-voice-runtime via Next API. */

export async function requestDevVoiceRuntimeStart(): Promise<boolean> {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    const res = await fetch("/api/dev/voice-runtime", { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestDevVoiceRuntimeStop(): Promise<boolean> {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    const res = await fetch("/api/dev/voice-runtime", { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestDevVoiceRuntimeRestart(): Promise<boolean> {
  await requestDevVoiceRuntimeStop();
  await new Promise((r) => window.setTimeout(r, 500));
  return requestDevVoiceRuntimeStart();
}
