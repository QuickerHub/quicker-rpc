const DEFAULT_THRESHOLD = 0.018;
const DEFAULT_HOLD_MS = 220;

function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

/** Detect sustained speech energy for barge-in while TTS is playing. */
export class MicEnergyGate {
  private readonly threshold: number;
  private readonly holdMs: number;
  private readonly onTrigger: () => void;
  private loudSince: number | null = null;
  private armed = true;

  constructor(options: {
    threshold?: number;
    holdMs?: number;
    onTrigger: () => void;
  }) {
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
    this.holdMs = options.holdMs ?? DEFAULT_HOLD_MS;
    this.onTrigger = options.onTrigger;
  }

  reset(): void {
    this.loudSince = null;
    this.armed = true;
  }

  disarm(): void {
    this.armed = false;
    this.loudSince = null;
  }

  handleFrame(samples: Float32Array): void {
    if (!this.armed) return;
    const level = rms(samples);
    const now = performance.now();
    if (level >= this.threshold) {
      this.loudSince ??= now;
      if (now - this.loudSince >= this.holdMs) {
        this.armed = false;
        this.onTrigger();
      }
      return;
    }
    this.loudSince = null;
  }
}
