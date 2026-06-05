/** Plugin lifecycle (Host-managed; mock simulates `running` in dev). */
export type VoicePluginStatus =
  | "not_installed"
  | "downloading"
  | "installed"
  | "starting"
  | "running"
  | "stopped"
  | "error";

/** Single voice recognition session (click start / stop). */
export type VoiceSessionPhase = "idle" | "recording" | "transcribing";

export const VOICE_INPUT_MOCK_STORAGE_KEY = "voice-asr-mock";

export const VOICE_INPUT_PROTOCOL_VERSION = 1;

export type VoiceTranscribeResult = {
  text: string;
  confidence?: number;
};

export type VoiceTranscribeOptions = {
  signal: AbortSignal;
  language?: string;
  streaming?: boolean;
  onPartial?: (text: string) => void;
};
