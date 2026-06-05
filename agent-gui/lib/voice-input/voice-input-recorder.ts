const TARGET_SAMPLE_RATE = 16_000;

function floatTo16BitLePcm(input: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i] ?? 0));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(i * 2, int16, true);
  }
  return new Uint8Array(buffer);
}

function downsampleTo16k(input: Float32Array, inputRate: number): Uint8Array {
  if (inputRate === TARGET_SAMPLE_RATE) {
    return floatTo16BitLePcm(input);
  }
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    output[i] = input[Math.floor(i * ratio)] ?? 0;
  }
  return floatTo16BitLePcm(output);
}

export type VoiceMicRecorderStopResult = {
  pcm: Uint8Array;
  durationMs: number;
  sampleRate: number;
};

/** Captures microphone audio as 16-bit LE mono PCM @ 16kHz. */
export class VoiceMicRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private chunks: Uint8Array[] = [];
  private startedAt = 0;
  private onChunk: ((chunk: Uint8Array) => void) | undefined;

  async start(onChunk?: (chunk: Uint8Array) => void): Promise<void> {
    if (this.stream) {
      throw new Error("VoiceMicRecorder already started");
    }

    this.onChunk = onChunk;
    this.chunks = [];
    this.startedAt = Date.now();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前环境不支持麦克风");
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });

    this.audioContext = new AudioContext();
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    const inputRate = this.audioContext.sampleRate;
    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    const silentGain = this.audioContext.createGain();
    silentGain.gain.value = 0;
    this.silentGain = silentGain;

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const pcm = downsampleTo16k(input, inputRate);
      if (pcm.byteLength === 0) return;
      this.chunks.push(pcm);
      this.onChunk?.(pcm);
    };

    this.source.connect(this.processor);
    this.processor.connect(silentGain);
    silentGain.connect(this.audioContext.destination);
  }

  async stop(): Promise<VoiceMicRecorderStopResult> {
    const durationMs = Math.max(0, Date.now() - this.startedAt);
    const sampleRate = TARGET_SAMPLE_RATE;

    let totalBytes = 0;
    for (const chunk of this.chunks ?? []) {
      totalBytes += chunk.byteLength;
    }
    const pcm = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of this.chunks ?? []) {
      pcm.set(chunk, offset);
      offset += chunk.byteLength;
    }

    this.dispose();
    return { pcm, durationMs, sampleRate };
  }

  dispose(): void {
    this.processor?.disconnect();
    this.silentGain?.disconnect();
    this.source?.disconnect();
    this.processor = null;
    this.silentGain = null;
    this.source = null;

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    this.chunks = [];
    this.onChunk = undefined;
  }
}
