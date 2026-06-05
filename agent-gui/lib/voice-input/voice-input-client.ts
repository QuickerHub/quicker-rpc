import { transcribePcmViaWebSocket } from "@/lib/voice-input/voice-input-ws-client";
import { mockTranscribePushToTalk } from "@/lib/voice-input/voice-input-mock";
import { isVoiceInputMockEnabled } from "@/lib/voice-input/voice-input-plugin-status";
import type {
  VoiceTranscribeOptions,
  VoiceTranscribeResult,
} from "@/lib/voice-input/voice-input-types";

export type PushToTalkTranscribeInput = VoiceTranscribeOptions & {
  recordedMs: number;
  pcm?: Uint8Array;
};

/**
 * Push-to-talk transcription entry point.
 * Mock: timing-only samples. Runtime: WebSocket + PCM (docs/voice-input-plugin.md).
 */
export async function transcribePushToTalk(
  input: PushToTalkTranscribeInput,
): Promise<VoiceTranscribeResult> {
  if (isVoiceInputMockEnabled()) {
    return mockTranscribePushToTalk(input);
  }

  if (!input.pcm || input.pcm.byteLength === 0) {
    return { text: "" };
  }

  return transcribePcmViaWebSocket(input.pcm, {
    language: input.language,
    streaming: input.streaming,
    signal: input.signal,
    recordedMs: input.recordedMs,
  });
}
