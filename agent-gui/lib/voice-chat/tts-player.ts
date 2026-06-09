type TtsPlayerOptions = {
  lang?: string;
  rate?: number;
  pitch?: number;
  onSpeakingChange?: (speaking: boolean) => void;
};

function pickChineseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const zh =
    voices.find((v) => v.lang.toLowerCase().startsWith("zh-cn") && !v.localService)
    ?? voices.find((v) => v.lang.toLowerCase().startsWith("zh"))
    ?? null;
  return zh;
}

/** Browser speech synthesis with queued chunks and fast flush for barge-in. */
export class TtsPlayer {
  private readonly lang: string;
  private readonly rate: number;
  private readonly pitch: number;
  private readonly onSpeakingChange?: (speaking: boolean) => void;
  private queue: string[] = [];
  private speaking = false;
  private disposed = false;

  constructor(options: TtsPlayerOptions = {}) {
    this.lang = options.lang ?? "zh-CN";
    this.rate = options.rate ?? 1.05;
    this.pitch = options.pitch ?? 1;
    this.onSpeakingChange = options.onSpeakingChange;
  }

  enqueue(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.disposed) return;
    this.queue.push(trimmed);
    void this.pump();
  }

  flush(): void {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    this.queue = [];
    window.speechSynthesis.cancel();
    this.setSpeaking(false);
  }

  dispose(): void {
    this.disposed = true;
    this.flush();
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  private setSpeaking(value: boolean): void {
    if (this.speaking === value) return;
    this.speaking = value;
    this.onSpeakingChange?.(value);
  }

  private async pump(): Promise<void> {
    if (this.disposed || this.speaking) return;
    const next = this.queue.shift();
    if (!next) {
      this.setSpeaking(false);
      return;
    }

    if (typeof window === "undefined" || !window.speechSynthesis) {
      this.setSpeaking(false);
      return;
    }

    this.setSpeaking(true);
    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(next);
      utterance.lang = this.lang;
      utterance.rate = this.rate;
      utterance.pitch = this.pitch;
      const voice = pickChineseVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });

    if (this.disposed) return;
    void this.pump();
  }
}
