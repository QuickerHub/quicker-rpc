export const DEFAULT_VOICE_WS_HOST = "127.0.0.1";
export const DEFAULT_VOICE_WS_PORT = 6016;
export const VOICE_WS_PORT_STORAGE_KEY = "voice-asr-ws-port";
export const VOICE_WS_PROTOCOL = "quicker-voice-v1";

export function getVoiceWsPort(): number {
  if (typeof window === "undefined") return DEFAULT_VOICE_WS_PORT;
  const stored = localStorage.getItem(VOICE_WS_PORT_STORAGE_KEY);
  if (!stored) return DEFAULT_VOICE_WS_PORT;
  const parsed = Number.parseInt(stored, 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535
    ? parsed
    : DEFAULT_VOICE_WS_PORT;
}

export function setVoiceWsPort(port: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VOICE_WS_PORT_STORAGE_KEY, String(port));
  window.dispatchEvent(new Event("voice-input-config-changed"));
}

export function buildVoiceHealthUrl(port = getVoiceWsPort()): string {
  return `http://${DEFAULT_VOICE_WS_HOST}:${port}/health`;
}

export function buildVoiceWsUrl(port = getVoiceWsPort()): string {
  return `ws://${DEFAULT_VOICE_WS_HOST}:${port}`;
}
