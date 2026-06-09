import { VoiceMicRecorder } from "@/lib/voice-input/voice-input-recorder";
import { isVoiceInputMockEnabled } from "@/lib/voice-input/voice-input-plugin-status";
import {
  startMockVoicePartialSession,
  type MockVoicePartialSession,
} from "@/lib/voice-input/voice-input-mock";
import { VoiceWsSession } from "@/lib/voice-input/voice-input-ws-client";

const UTTERANCE_SILENCE_MS = 1_200;
const MIN_UTTERANCE_CHARS = 2;
const PARTIAL_POLL_MS = 200;

export type DuplexAsrLoopOptions = {
  signal: AbortSignal;
  onPartial: (text: string) => void;
  onUtterance: (text: string) => void;
  onAudioFrame?: (samples: Float32Array) => void;
};

/** Continuous mic capture with utterance segmentation via streaming ASR. */
export class DuplexAsrLoop {
  private readonly signal: AbortSignal;
  private readonly onPartial: (text: string) => void;
  private readonly onUtterance: (text: string) => void;
  private readonly onAudioFrame?: (samples: Float32Array) => void;

  private recorder: VoiceMicRecorder | null = null;
  private wsSession: VoiceWsSession | null = null;
  private mockPartial: MockVoicePartialSession | null = null;
  private pollTimer: number | null = null;
  private lastPartialText = "";
  private lastPartialChangeAt = 0;
  private finalizing = false;
  private stopped = false;
  private utteranceDetectionPaused = false;

  constructor(options: DuplexAsrLoopOptions) {
    this.signal = options.signal;
    this.onPartial = options.onPartial;
    this.onUtterance = options.onUtterance;
    this.onAudioFrame = options.onAudioFrame;
  }

  async start(): Promise<void> {
    if (this.stopped) return;

    if (isVoiceInputMockEnabled()) {
      await this.startMock();
      return;
    }

    const wsSession = new VoiceWsSession({
      language: "zh-CN",
      streaming: true,
      signal: this.signal,
      onPartial: (text) => this.handlePartial(text),
    });
    await wsSession.connect();
    await wsSession.startSession();
    this.wsSession = wsSession;

    const recorder = new VoiceMicRecorder();
    await recorder.start(
      (chunk) => this.wsSession?.sendAudio(chunk),
      (frame) => this.onAudioFrame?.(frame),
    );
    this.recorder = recorder;
    this.beginSilenceWatcher();
  }

  pauseUtteranceDetection(): void {
    this.utteranceDetectionPaused = true;
    this.clearSilenceWatcher();
  }

  resumeUtteranceDetection(): void {
    this.utteranceDetectionPaused = false;
    this.lastPartialText = "";
    this.lastPartialChangeAt = performance.now();
    this.beginSilenceWatcher();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearSilenceWatcher();
    this.mockPartial?.stop();
    this.mockPartial = null;
    this.recorder?.dispose();
    this.recorder = null;
    this.wsSession?.cancel("stopped");
    this.wsSession?.close();
    this.wsSession = null;
  }

  /** Cancel in-flight utterance finalize and start a fresh ASR session. */
  async restartCycle(): Promise<void> {
    if (this.stopped) return;
    this.clearSilenceWatcher();
    this.finalizing = false;
    this.lastPartialText = "";
    this.lastPartialChangeAt = performance.now();
    this.mockPartial?.stop();
    this.mockPartial = null;
    this.wsSession?.cancel("restart");
    this.wsSession?.close();
    this.wsSession = null;

    if (isVoiceInputMockEnabled()) {
      await this.startMock();
      return;
    }

    const wsSession = new VoiceWsSession({
      language: "zh-CN",
      streaming: true,
      signal: this.signal,
      onPartial: (text) => this.handlePartial(text),
    });
    await wsSession.connect();
    await wsSession.startSession();
    this.wsSession = wsSession;
    this.beginSilenceWatcher();
  }

  private async startMock(): Promise<void> {
    this.mockPartial = startMockVoicePartialSession((text) => {
      this.handlePartial(text);
    });
    this.beginSilenceWatcher();
    // Mock path has no mic frames; barge-in uses manual button in UI.
  }

  private handlePartial(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed !== this.lastPartialText) {
      this.lastPartialText = trimmed;
      this.lastPartialChangeAt = performance.now();
    }
    this.onPartial(trimmed);
  }

  private beginSilenceWatcher(): void {
    this.clearSilenceWatcher();
    this.lastPartialChangeAt = performance.now();
    this.pollTimer = window.setInterval(() => {
      void this.maybeFinalizeUtterance();
    }, PARTIAL_POLL_MS);
  }

  private clearSilenceWatcher(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async maybeFinalizeUtterance(): Promise<void> {
    if (this.finalizing || this.stopped || this.utteranceDetectionPaused) return;
    const text = this.lastPartialText.trim();
    if (text.length < MIN_UTTERANCE_CHARS) return;
    if (performance.now() - this.lastPartialChangeAt < UTTERANCE_SILENCE_MS) return;
    await this.finalizeUtterance();
  }

  private async finalizeUtterance(): Promise<void> {
    if (this.finalizing || this.stopped) return;
    this.finalizing = true;
    this.clearSilenceWatcher();

    try {
      if (isVoiceInputMockEnabled()) {
        const finalText = this.mockPartial?.finalText?.trim() ?? this.lastPartialText;
        this.mockPartial?.stop();
        this.mockPartial = null;
        this.lastPartialText = "";
        if (finalText.length >= MIN_UTTERANCE_CHARS) {
          this.onUtterance(finalText);
        }
        if (!this.stopped) {
          await this.restartCycle();
        }
        return;
      }

      const wsSession = this.wsSession;
      if (!wsSession) return;
      const result = await wsSession.endSession();
      this.wsSession = null;
      const finalText = result.text.trim() || this.lastPartialText;
      this.lastPartialText = "";
      if (finalText.length >= MIN_UTTERANCE_CHARS) {
        this.onUtterance(finalText);
      }
      if (!this.stopped) {
        await this.restartCycle();
      }
    } catch (error) {
      if (this.signal.aborted) return;
      throw error;
    } finally {
      this.finalizing = false;
    }
  }
}
