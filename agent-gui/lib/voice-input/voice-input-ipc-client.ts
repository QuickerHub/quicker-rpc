import type { VoiceTranscribeResult } from "@/lib/voice-input/voice-input-types";
import {
  fetchTauriVoicePluginStatus,
  tauriVoiceIpcSessionCancel,
  tauriVoiceIpcSessionEnd,
  tauriVoiceIpcSessionSendAudio,
  tauriVoiceIpcSessionStart,
  tauriVoicePluginStartRuntime,
} from "@/lib/voice-input/voice-input-tauri";

export type VoiceIpcSessionOptions = {
  language?: string;
  streaming?: boolean;
  signal?: AbortSignal;
  onPartial?: (text: string) => void;
};

/** Voice session via Tauri IPC → Rust stdio bridge → quicker-voice-runtime. */
export class VoiceIpcSession {
  private readonly sessionId: string;
  private readonly language: string;
  private readonly streaming: boolean;
  private readonly signal?: AbortSignal;
  private readonly onPartial?: (text: string) => void;

  private started = false;
  private ended = false;
  private unlistenPartial: (() => void) | undefined;
  private abortListener: (() => void) | undefined;

  constructor(options: VoiceIpcSessionOptions = {}) {
    this.sessionId = crypto.randomUUID();
    this.language = options.language ?? "zh-CN";
    this.streaming = options.streaming ?? false;
    this.signal = options.signal;
    this.onPartial = options.onPartial;
  }

  async connect(): Promise<void> {
    if (this.started) return;

    const onAbort = () => {
      void this.cancel("aborted");
    };
    if (this.signal) {
      if (this.signal.aborted) {
        onAbort();
        throw new DOMException("Aborted", "AbortError");
      }
      this.signal.addEventListener("abort", onAbort, { once: true });
      this.abortListener = onAbort;
    }

    let dto = await tauriVoicePluginStartRuntime();
    const deadline = Date.now() + 45_000;
    while (dto.status === "starting" && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      dto = (await fetchTauriVoicePluginStatus()) ?? dto;
    }
    if (dto.status !== "running") {
      throw new Error(dto.message ?? "语音 Runtime 未就绪");
    }

    const { listen } = await import("@tauri-apps/api/event");
    this.unlistenPartial = await listen<{ sessionId: string; text: string }>(
      "voice-ipc-partial",
      (event) => {
        if (event.payload.sessionId !== this.sessionId) return;
        this.onPartial?.(event.payload.text);
      },
    );

    await tauriVoiceIpcSessionStart({
      sessionId: this.sessionId,
      language: this.language,
      streaming: this.streaming,
    });
    this.started = true;
  }

  sendAudio(pcm: Uint8Array): void {
    if (!this.started || this.ended || pcm.byteLength === 0) return;
    void tauriVoiceIpcSessionSendAudio({
      sessionId: this.sessionId,
      pcm,
    }).catch(() => {
      // ignore send errors while recording; endSession surfaces failures
    });
  }

  async endSession(): Promise<VoiceTranscribeResult> {
    if (this.ended) {
      return { text: "" };
    }
    this.ended = true;
    try {
      const result = await tauriVoiceIpcSessionEnd({ sessionId: this.sessionId });
      return {
        text: result.text,
        confidence: result.confidence ?? undefined,
      };
    } finally {
      this.close();
    }
  }

  cancel(reason = "user_cancelled"): void {
    if (this.ended) return;
    this.ended = true;
    void tauriVoiceIpcSessionCancel({
      sessionId: this.sessionId,
      reason,
    }).finally(() => this.close());
  }

  close(): void {
    if (this.signal && this.abortListener) {
      this.signal.removeEventListener("abort", this.abortListener);
    }
    this.abortListener = undefined;
    void this.unlistenPartial?.();
    this.unlistenPartial = undefined;
  }
}

export async function transcribePcmViaIpc(
  pcm: Uint8Array,
  options: VoiceIpcSessionOptions & { recordedMs: number },
): Promise<VoiceTranscribeResult> {
  if (options.recordedMs < 200 || pcm.byteLength === 0) {
    return { text: "" };
  }

  const session = new VoiceIpcSession(options);
  try {
    await session.connect();
    session.sendAudio(pcm);
    return await session.endSession();
  } catch (error) {
    session.cancel("failed");
    throw error;
  }
}
