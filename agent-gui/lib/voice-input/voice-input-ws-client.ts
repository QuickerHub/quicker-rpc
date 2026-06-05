import {
  buildVoiceWsUrl,
  getVoiceWsPort,
  VOICE_WS_PROTOCOL,
} from "@/lib/voice-input/voice-input-config";
import type {
  VoiceTranscribeResult,
} from "@/lib/voice-input/voice-input-types";

const SESSION_START_TIMEOUT_MS = 2_000;
const FINAL_TIMEOUT_MS = 15_000;

type RuntimeInboundMessage = {
  type: string;
  sessionId?: string;
  text?: string;
  confidence?: number;
  code?: string;
  message?: string;
};

function parseRuntimeMessage(raw: unknown): RuntimeInboundMessage | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const msg = parsed as RuntimeInboundMessage;
    return typeof msg.type === "string" ? msg : null;
  } catch {
    return null;
  }
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  ws.send(JSON.stringify(payload));
}

export type VoiceWsSessionOptions = {
  language?: string;
  streaming?: boolean;
  port?: number;
  signal?: AbortSignal;
  onPartial?: (text: string) => void;
};

/** One voice input session over quicker-voice-v1 WebSocket protocol. */
export class VoiceWsSession {
  private readonly sessionId: string;
  private readonly language: string;
  private readonly streaming: boolean;
  private readonly port: number;
  private readonly signal?: AbortSignal;
  private readonly onPartial?: (text: string) => void;

  private ws: WebSocket | null = null;
  private started = false;
  private ended = false;
  private finalPromise: Promise<VoiceTranscribeResult> | null = null;
  private resolveFinal: ((value: VoiceTranscribeResult) => void) | null = null;
  private rejectFinal: ((reason: Error) => void) | null = null;
  private abortListener: (() => void) | null = null;
  private pendingStart:
    | { resolve: () => void; reject: (error: Error) => void }
    | null = null;

  constructor(options: VoiceWsSessionOptions = {}) {
    this.sessionId = crypto.randomUUID();
    this.language = options.language ?? "zh-CN";
    this.streaming = options.streaming ?? false;
    this.port = options.port ?? getVoiceWsPort();
    this.signal = options.signal;
    this.onPartial = options.onPartial;
  }

  async connect(): Promise<void> {
    if (this.ws) return;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(buildVoiceWsUrl(this.port), [VOICE_WS_PROTOCOL]);
      this.ws = ws;

      const onAbort = () => {
        reject(new DOMException("Aborted", "AbortError"));
        ws.close();
      };
      if (this.signal) {
        if (this.signal.aborted) {
          onAbort();
          return;
        }
        this.signal.addEventListener("abort", onAbort, { once: true });
        this.abortListener = onAbort;
      }

      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("无法连接语音服务"));
      ws.onclose = (event) => {
        if (this.pendingStart) {
          this.pendingStart.reject(
            new Error(
              event.code === 1006
                ? "语音服务连接异常关闭，请重启语音 Runtime"
                : "语音服务连接已关闭",
            ),
          );
          this.pendingStart = null;
        }
        if (!this.ended && this.rejectFinal) {
          this.rejectFinal(new Error("语音服务连接已关闭"));
        }
      };
      ws.onmessage = (event) => this.handleMessage(event.data);
    });
  }

  async startSession(): Promise<void> {
    const ws = this.requireWs();

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pendingStart = null;
        reject(new Error("语音服务响应超时"));
      }, SESSION_START_TIMEOUT_MS);

      this.pendingStart = {
        resolve: () => {
          window.clearTimeout(timer);
          this.pendingStart = null;
          this.started = true;
          resolve();
        },
        reject: (error) => {
          window.clearTimeout(timer);
          this.pendingStart = null;
          reject(error);
        },
      };

      sendJson(ws, {
        type: "session.start",
        sessionId: this.sessionId,
        language: this.language,
        streaming: this.streaming,
        sampleRate: 16_000,
        channels: 1,
        encoding: "pcm_s16le",
      });
    });
  }

  sendAudio(pcm: Uint8Array): void {
    if (!this.started || this.ended) return;
    const ws = this.requireWs();
    ws.send(pcm);
  }

  endSession(): Promise<VoiceTranscribeResult> {
    if (this.finalPromise) return this.finalPromise;
    const ws = this.requireWs();
    this.ended = true;

    this.finalPromise = new Promise<VoiceTranscribeResult>((resolve, reject) => {
      this.resolveFinal = resolve;
      this.rejectFinal = reject;

      const timer = window.setTimeout(() => {
        this.cancel("timeout");
        reject(new Error("识别超时"));
      }, FINAL_TIMEOUT_MS);

      const finishOk = (result: VoiceTranscribeResult) => {
        window.clearTimeout(timer);
        resolve(result);
        this.close();
      };
      const finishErr = (error: Error) => {
        window.clearTimeout(timer);
        reject(error);
        this.close();
      };

      this.resolveFinal = (result) => finishOk(result);
      this.rejectFinal = (error) => finishErr(error);

      sendJson(ws, {
        type: "session.end",
        sessionId: this.sessionId,
      });
    });

    return this.finalPromise;
  }

  cancel(reason = "user_cancelled"): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (this.started && !this.ended) {
      sendJson(ws, {
        type: "session.cancel",
        sessionId: this.sessionId,
        reason,
      });
    }
    this.ended = true;
    this.rejectFinal?.(new DOMException("Aborted", "AbortError"));
    this.close();
  }

  detachAbortSignal(): void {
    if (this.signal && this.abortListener) {
      this.signal.removeEventListener("abort", this.abortListener);
    }
    this.abortListener = null;
  }

  close(): void {
    this.detachAbortSignal();
    if (this.ws) {
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN) {
        if (this.started && !this.ended) {
          sendJson(this.ws, {
            type: "session.cancel",
            sessionId: this.sessionId,
            reason: "closed",
          });
        }
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private requireWs(): WebSocket {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("语音服务未连接");
    }
    return this.ws;
  }

  private handleMessage(data: unknown): void {
    const msg = parseRuntimeMessage(data);
    if (!msg) return;

    if (msg.sessionId && msg.sessionId !== this.sessionId) return;

    switch (msg.type) {
      case "session.started":
        if (msg.sessionId === this.sessionId) {
          this.pendingStart?.resolve();
        }
        break;
      case "partial":
        if (typeof msg.text === "string") {
          this.onPartial?.(msg.text);
        }
        break;
      case "final":
        this.resolveFinal?.({
          text: typeof msg.text === "string" ? msg.text : "",
          confidence:
            typeof msg.confidence === "number" ? msg.confidence : undefined,
        });
        break;
      case "error":
        if (this.pendingStart) {
          this.pendingStart.reject(
            new Error(msg.message ?? msg.code ?? "语音服务错误"),
          );
          break;
        }
        this.rejectFinal?.(
          new Error(msg.message ?? msg.code ?? "语音识别失败"),
        );
        break;
      case "session.ended":
        break;
      default:
        break;
    }
  }
}

export async function transcribePcmViaWebSocket(
  pcm: Uint8Array,
  options: VoiceWsSessionOptions & { recordedMs: number },
): Promise<VoiceTranscribeResult> {
  if (options.recordedMs < 200 || pcm.byteLength === 0) {
    return { text: "" };
  }

  const session = new VoiceWsSession(options);
  try {
    await session.connect();
    await session.startSession();
    session.sendAudio(pcm);
    return await session.endSession();
  } catch (error) {
    session.cancel("failed");
    throw error;
  }
}
