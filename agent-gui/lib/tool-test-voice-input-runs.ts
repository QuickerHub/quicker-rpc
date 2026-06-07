import type { VoiceStartupBenchmarkMode, VoiceStartupTimings } from "@/lib/voice-input/voice-input-startup-benchmark";

export type VoiceInputRunEntry = {
  id: string;
  at: number;
  mode: VoiceStartupBenchmarkMode;
  modeLabel: string;
  status: "running" | "done" | "error";
  timings?: VoiceStartupTimings;
  error?: string;
};

export function createVoiceInputRunId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const VOICE_STARTUP_MODE_LABELS: Record<VoiceStartupBenchmarkMode, string> = {
  "mic-only": "仅麦克风",
  "ws-only": "仅 WebSocket",
  "production-sequential": "生产流程（WS → 麦克风）",
  "mic-first-parallel": "麦克风优先（并行 + 缓冲）",
  "composer-simulate": "模拟 Composer（3s 录音）",
};
