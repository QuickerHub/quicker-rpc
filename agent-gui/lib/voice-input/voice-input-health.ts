import { buildVoiceHealthUrl } from "@/lib/voice-input/voice-input-config";
import { VOICE_INPUT_PROTOCOL_VERSION } from "@/lib/voice-input/voice-input-types";

export type VoiceRuntimeHealth = {
  ok: boolean;
  protocolVersion: number;
  runtimeVersion?: string;
  modelId?: string;
  modelLoaded: boolean;
  ready: boolean;
};

const HEALTH_FETCH_TIMEOUT_MS = 5_000;

export async function fetchVoiceRuntimeHealth(
  port?: number,
  signal?: AbortSignal,
): Promise<VoiceRuntimeHealth | null> {
  try {
    const timeoutSignal =
      typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
        ? AbortSignal.timeout(HEALTH_FETCH_TIMEOUT_MS)
        : undefined;
    const res = await fetch(buildVoiceHealthUrl(port), {
      cache: "no-store",
      signal: signal ?? timeoutSignal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Record<string, unknown>;
    if (data.ok !== true) return null;
    const protocolVersion =
      typeof data.protocolVersion === "number"
        ? data.protocolVersion
        : VOICE_INPUT_PROTOCOL_VERSION;
    return {
      ok: true,
      protocolVersion,
      runtimeVersion:
        typeof data.runtimeVersion === "string" ? data.runtimeVersion : undefined,
      modelId: typeof data.modelId === "string" ? data.modelId : undefined,
      modelLoaded: data.modelLoaded === true,
      ready: data.ready === true,
    };
  } catch {
    return null;
  }
}
