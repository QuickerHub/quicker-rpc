import type {
  VoiceTranscribeOptions,
  VoiceTranscribeResult,
} from "@/lib/voice-input/voice-input-types";

const MOCK_SAMPLES = [
  "帮我在 Quicker 里创建一个剪贴板动作",
  "搜索包含「邮件」的动作并列出前五个",
  "打开动作回收站设置页面",
  "用 step-runner 查一下 sys:evalexpression 的参数",
] as const;

const MOCK_TRANSCRIBE_MS = 700;
const MOCK_MIN_RECORD_MS = 200;
const MOCK_PARTIAL_INTERVAL_MS = 220;

let sampleIndex = 0;

function nextMockSample(): string {
  const text = MOCK_SAMPLES[sampleIndex % MOCK_SAMPLES.length] ?? MOCK_SAMPLES[0];
  sampleIndex += 1;
  return text;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Simulates push-to-talk ASR for Composer UI development. */
export async function mockTranscribePushToTalk(
  options: VoiceTranscribeOptions & { recordedMs: number },
): Promise<VoiceTranscribeResult> {
  const { signal, recordedMs, streaming, onPartial } = options;

  if (recordedMs < MOCK_MIN_RECORD_MS) {
    await sleep(MOCK_TRANSCRIBE_MS / 2, signal);
    return { text: "" };
  }

  const finalText = nextMockSample();

  if (streaming && onPartial) {
    const partial = finalText.slice(0, Math.max(4, Math.floor(finalText.length * 0.45)));
    onPartial(partial);
    await sleep(MOCK_TRANSCRIBE_MS / 2, signal);
  } else {
    await sleep(MOCK_TRANSCRIBE_MS, signal);
  }

  return { text: finalText, confidence: 0.95 };
}

export type MockVoicePartialSession = {
  finalText: string;
  stop: () => void;
};

/** Emit growing partial text while the user is recording (mock). */
export function startMockVoicePartialSession(
  onPartial: (text: string) => void,
  intervalMs = MOCK_PARTIAL_INTERVAL_MS,
): MockVoicePartialSession {
  const finalText = nextMockSample();
  let index = 0;
  const timer = window.setInterval(() => {
    index = Math.min(
      finalText.length,
      index + Math.max(1, Math.ceil(finalText.length / 6)),
    );
    onPartial(finalText.slice(0, index));
  }, intervalMs);

  return {
    finalText,
    stop: () => {
      window.clearInterval(timer);
    },
  };
}

/** Finalize mock streaming after stop (short settle delay). */
export async function mockStreamVoiceSession(
  options: VoiceTranscribeOptions & {
    recordedMs: number;
    finalText: string;
  },
): Promise<VoiceTranscribeResult> {
  const { signal, recordedMs, finalText, onPartial } = options;

  if (recordedMs < MOCK_MIN_RECORD_MS) {
    await sleep(MOCK_TRANSCRIBE_MS / 2, signal);
    return { text: "" };
  }

  if (onPartial && finalText) {
    onPartial(finalText);
  }
  await sleep(MOCK_TRANSCRIBE_MS / 3, signal);
  return { text: finalText, confidence: 0.95 };
}
