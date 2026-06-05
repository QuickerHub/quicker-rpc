"use client";

export const VOICE_COORDINATION_CHANNEL = "quicker-agent-voice-v1";

export type VoiceInterruptMessage = {
  type: "voice:interrupt";
  sourceId: string;
};

function createVoiceSourceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable id for this webview instance (main vs launcher). */
export function createVoiceCoordinationSourceId(): string {
  return createVoiceSourceId();
}

/** Ask other Agent webviews to stop voice capture before starting here. */
export function broadcastVoiceInterrupt(sourceId: string): void {
  if (typeof window === "undefined") return;
  const channel = new BroadcastChannel(VOICE_COORDINATION_CHANNEL);
  channel.postMessage({
    type: "voice:interrupt",
    sourceId,
  } satisfies VoiceInterruptMessage);
  channel.close();
}

export function subscribeVoiceInterrupt(
  sourceId: string,
  onInterrupt: () => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const channel = new BroadcastChannel(VOICE_COORDINATION_CHANNEL);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (!data || typeof data !== "object" || !("type" in data)) return;
    const payload = data as VoiceInterruptMessage;
    if (payload.type !== "voice:interrupt") return;
    if (payload.sourceId === sourceId) return;
    onInterrupt();
  };
  return () => channel.close();
}
