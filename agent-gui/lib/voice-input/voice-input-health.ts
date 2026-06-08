import { buildVoiceHealthUrl } from "@/lib/voice-input/voice-input-config";
import { VOICE_INPUT_PROTOCOL_VERSION } from "@/lib/voice-input/voice-input-types";
import { isTauriShell } from "@/lib/tauri-shell";

export type VoiceRuntimeHealth = {
  ok: boolean;
  protocolVersion: number;
  runtimeVersion?: string;
  modelId?: string;
  modelLoaded: boolean;
  ready: boolean;
  executionProvider?: string;
};

/** True when runtime has a real ASR model loaded (not stub / placeholder). */
export function isVoiceRuntimeModelReady(
  health: VoiceRuntimeHealth | null | undefined,
): boolean {
  if (!health?.ok) return false;
  if (!health.ready || !health.modelLoaded) return false;
  const modelId = health.modelId?.trim().toLowerCase();
  if (!modelId || modelId === "stub") return false;
  return true;
}

export function isStubVoiceTranscript(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith("[stub]");
}

const HEALTH_FETCH_TIMEOUT_MS = 5_000;

type VoiceRuntimeHealthDto = {
  ok: boolean;
  protocolVersion: number;
  runtimeVersion?: string;
  modelId?: string;
  modelLoaded: boolean;
  ready: boolean;
  executionProvider?: string;
};

function mapVoiceRuntimeHealthDto(dto: VoiceRuntimeHealthDto): VoiceRuntimeHealth {
  return {
    ok: dto.ok === true,
    protocolVersion: dto.protocolVersion,
    runtimeVersion: dto.runtimeVersion,
    modelId: dto.modelId,
    modelLoaded: dto.modelLoaded === true,
    ready: dto.ready === true,
    executionProvider: dto.executionProvider,
  };
}

async function fetchVoiceRuntimeHealthViaTauri(): Promise<VoiceRuntimeHealth | null> {
  if (!isTauriShell()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const dto = await invoke<VoiceRuntimeHealthDto>("voice_runtime_health");
    if (!dto?.ok) return null;
    return mapVoiceRuntimeHealthDto(dto);
  } catch {
    return null;
  }
}

export async function fetchVoiceRuntimeHealth(
  port?: number,
  signal?: AbortSignal,
): Promise<VoiceRuntimeHealth | null> {
  if (isTauriShell()) {
    const viaTauri = await fetchVoiceRuntimeHealthViaTauri();
    if (viaTauri) return viaTauri;
  }

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
      executionProvider:
        typeof data.executionProvider === "string"
          ? data.executionProvider
          : undefined,
    };
  } catch {
    return null;
  }
}
