import { VoiceMicRecorder } from "@/lib/voice-input/voice-input-recorder";
import { VoiceWsSession } from "@/lib/voice-input/voice-input-ws-client";

export type VoiceStartupBenchmarkMode =
  | "mic-only"
  | "ws-only"
  | "production-sequential"
  | "mic-first-parallel"
  | "composer-simulate";

export type VoiceStartupTimings = {
  mode: VoiceStartupBenchmarkMode;
  startedAt: number;
  /** getUserMedia + AudioContext ready */
  micGetUserMediaMs: number | null;
  /** First PCM chunk from ScriptProcessor */
  micFirstChunkMs: number | null;
  /** WebSocket onopen */
  wsConnectMs: number | null;
  /** session.started received */
  wsSessionStartMs: number | null;
  /** Mic streaming to WS (production) or buffer flushed (parallel) */
  setupCompleteMs: number | null;
  /** First partial transcript from runtime */
  firstPartialMs: number | null;
  firstPartialText: string | null;
  bufferedChunksBeforeReady: number;
  bufferedBytesBeforeReady: number;
  recordDurationMs: number | null;
  pcmBytesSent: number;
};

export type VoiceStartupBenchmarkOptions = {
  signal?: AbortSignal;
  recordDurationMs?: number;
};

function markMs(startedAt: number, at: number | null): number | null {
  if (at == null) return null;
  return Math.max(0, at - startedAt);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createPartialTracker(): {
  firstPartialAt: number | null;
  firstPartialText: string | null;
  onPartial: (text: string) => void;
} {
  const state = {
    firstPartialAt: null as number | null,
    firstPartialText: null as string | null,
  };
  return {
    get firstPartialAt() {
      return state.firstPartialAt;
    },
    get firstPartialText() {
      return state.firstPartialText;
    },
    onPartial(text: string) {
      if (state.firstPartialAt == null && text.trim()) {
        state.firstPartialAt = Date.now();
        state.firstPartialText = text;
      }
    },
  };
}

async function waitForFirstChunk(
  startedAt: number,
  getFirstChunkAt: () => number | null,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = startedAt + 5_000;
  while (getFirstChunkAt() == null && Date.now() < deadline) {
    throwIfAborted(signal);
    await sleepMs(20, signal);
  }
  await sleepMs(300, signal);
}

async function runMicOnly(
  startedAt: number,
  signal?: AbortSignal,
): Promise<Partial<VoiceStartupTimings>> {
  const recorder = new VoiceMicRecorder();
  let micGetUserMediaAt: number | null = null;
  let micFirstChunkAt: number | null = null;

  try {
    await recorder.start((chunk) => {
      if (micFirstChunkAt == null && chunk.byteLength > 0) {
        micFirstChunkAt = Date.now();
      }
    });
    micGetUserMediaAt = Date.now();

    await waitForFirstChunk(startedAt, () => micFirstChunkAt, signal);
    const { pcm } = await recorder.stop();

    return {
      micGetUserMediaMs: markMs(startedAt, micGetUserMediaAt),
      micFirstChunkMs: markMs(startedAt, micFirstChunkAt),
      setupCompleteMs: markMs(startedAt, micFirstChunkAt),
      pcmBytesSent: pcm.byteLength,
    };
  } finally {
    recorder.dispose();
  }
}

async function runWsOnly(
  startedAt: number,
  signal?: AbortSignal,
): Promise<Partial<VoiceStartupTimings>> {
  const session = new VoiceWsSession({
    language: "zh-CN",
    streaming: true,
    signal,
  });
  let wsConnectAt: number | null = null;
  let wsSessionStartAt: number | null = null;

  try {
    await session.connect();
    wsConnectAt = Date.now();
    throwIfAborted(signal);
    await session.startSession();
    wsSessionStartAt = Date.now();

    return {
      wsConnectMs: markMs(startedAt, wsConnectAt),
      wsSessionStartMs: markMs(startedAt, wsSessionStartAt),
      setupCompleteMs: markMs(startedAt, wsSessionStartAt),
    };
  } finally {
    session.cancel("benchmark_done");
    session.close();
  }
}

async function runProductionSequential(
  startedAt: number,
  signal: AbortSignal | undefined,
  recordDurationMs: number,
): Promise<Partial<VoiceStartupTimings>> {
  const partialTracker = createPartialTracker();
  const session = new VoiceWsSession({
    language: "zh-CN",
    streaming: true,
    signal,
    onPartial: partialTracker.onPartial,
  });
  const recorder = new VoiceMicRecorder();
  let wsConnectAt: number | null = null;
  let wsSessionStartAt: number | null = null;
  let micGetUserMediaAt: number | null = null;
  let micFirstChunkAt: number | null = null;
  let setupCompleteAt: number | null = null;
  let pcmBytesSent = 0;

  try {
    await session.connect();
    wsConnectAt = Date.now();
    throwIfAborted(signal);
    await session.startSession();
    wsSessionStartAt = Date.now();

    await recorder.start((chunk) => {
      if (micFirstChunkAt == null && chunk.byteLength > 0) {
        micFirstChunkAt = Date.now();
      }
      session.sendAudio(chunk);
      pcmBytesSent += chunk.byteLength;
      if (setupCompleteAt == null) {
        setupCompleteAt = Date.now();
      }
    });
    micGetUserMediaAt = Date.now();

    if (recordDurationMs > 0) {
      await sleepMs(recordDurationMs, signal);
    } else {
      await waitForFirstChunk(startedAt, () => micFirstChunkAt, signal);
    }

    await recorder.stop();
    recorder.dispose();

    if (recordDurationMs > 0) {
      try {
        await session.endSession();
      } catch {
        session.cancel("benchmark_done");
      }
    } else {
      session.cancel("benchmark_done");
    }

    return {
      micGetUserMediaMs: markMs(startedAt, micGetUserMediaAt),
      micFirstChunkMs: markMs(startedAt, micFirstChunkAt),
      wsConnectMs: markMs(startedAt, wsConnectAt),
      wsSessionStartMs: markMs(startedAt, wsSessionStartAt),
      setupCompleteMs: markMs(startedAt, setupCompleteAt ?? micFirstChunkAt),
      firstPartialMs: markMs(startedAt, partialTracker.firstPartialAt),
      firstPartialText: partialTracker.firstPartialText,
      recordDurationMs: recordDurationMs > 0 ? recordDurationMs : null,
      pcmBytesSent,
    };
  } finally {
    recorder.dispose();
    session.close();
  }
}

async function runMicFirstParallel(
  startedAt: number,
  signal: AbortSignal | undefined,
  recordDurationMs: number,
): Promise<Partial<VoiceStartupTimings>> {
  const partialTracker = createPartialTracker();
  const session = new VoiceWsSession({
    language: "zh-CN",
    streaming: true,
    signal,
    onPartial: partialTracker.onPartial,
  });
  const recorder = new VoiceMicRecorder();
  const buffered: Uint8Array[] = [];
  let wsReady = false;
  let wsConnectAt: number | null = null;
  let wsSessionStartAt: number | null = null;
  let micGetUserMediaAt: number | null = null;
  let micFirstChunkAt: number | null = null;
  let setupCompleteAt: number | null = null;
  let bufferedChunksBeforeReady = 0;
  let bufferedBytesBeforeReady = 0;
  let pcmBytesSent = 0;

  try {
    const micPromise = recorder.start((chunk) => {
      if (micFirstChunkAt == null && chunk.byteLength > 0) {
        micFirstChunkAt = Date.now();
      }
      if (wsReady) {
        session.sendAudio(chunk);
        pcmBytesSent += chunk.byteLength;
      } else {
        buffered.push(chunk);
        bufferedChunksBeforeReady += 1;
        bufferedBytesBeforeReady += chunk.byteLength;
      }
    });

    const wsPromise = (async () => {
      await session.connect();
      wsConnectAt = Date.now();
      throwIfAborted(signal);
      await session.startSession();
      wsSessionStartAt = Date.now();
      wsReady = true;
      for (const chunk of buffered) {
        session.sendAudio(chunk);
        pcmBytesSent += chunk.byteLength;
      }
      buffered.length = 0;
      setupCompleteAt = Date.now();
    })();

    await micPromise;
    micGetUserMediaAt = Date.now();
    await wsPromise;

    if (recordDurationMs > 0) {
      await sleepMs(recordDurationMs, signal);
    } else {
      await waitForFirstChunk(startedAt, () => micFirstChunkAt, signal);
    }

    await recorder.stop();
    recorder.dispose();

    if (recordDurationMs > 0) {
      try {
        await session.endSession();
      } catch {
        session.cancel("benchmark_done");
      }
    } else {
      session.cancel("benchmark_done");
    }

    return {
      micGetUserMediaMs: markMs(startedAt, micGetUserMediaAt),
      micFirstChunkMs: markMs(startedAt, micFirstChunkAt),
      wsConnectMs: markMs(startedAt, wsConnectAt),
      wsSessionStartMs: markMs(startedAt, wsSessionStartAt),
      setupCompleteMs: markMs(startedAt, setupCompleteAt),
      firstPartialMs: markMs(startedAt, partialTracker.firstPartialAt),
      firstPartialText: partialTracker.firstPartialText,
      bufferedChunksBeforeReady,
      bufferedBytesBeforeReady,
      recordDurationMs: recordDurationMs > 0 ? recordDurationMs : null,
      pcmBytesSent,
    };
  } finally {
    recorder.dispose();
    session.close();
  }
}

export async function runVoiceStartupBenchmark(
  mode: VoiceStartupBenchmarkMode,
  options: VoiceStartupBenchmarkOptions = {},
): Promise<VoiceStartupTimings> {
  const startedAt = Date.now();
  const { signal, recordDurationMs = 0 } = options;

  const base: VoiceStartupTimings = {
    mode,
    startedAt,
    micGetUserMediaMs: null,
    micFirstChunkMs: null,
    wsConnectMs: null,
    wsSessionStartMs: null,
    setupCompleteMs: null,
    firstPartialMs: null,
    firstPartialText: null,
    bufferedChunksBeforeReady: 0,
    bufferedBytesBeforeReady: 0,
    recordDurationMs: null,
    pcmBytesSent: 0,
  };

  const duration =
    mode === "composer-simulate" ? 3_000 : recordDurationMs;

  let partial: Partial<VoiceStartupTimings>;
  switch (mode) {
    case "mic-only":
      partial = await runMicOnly(startedAt, signal);
      break;
    case "ws-only":
      partial = await runWsOnly(startedAt, signal);
      break;
    case "production-sequential":
    case "composer-simulate":
      partial = await runProductionSequential(startedAt, signal, duration);
      break;
    case "mic-first-parallel":
      partial = await runMicFirstParallel(startedAt, signal, duration);
      break;
    default:
      partial = {};
  }

  return { ...base, ...partial };
}
