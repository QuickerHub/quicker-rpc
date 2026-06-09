import type { VoiceChatTurn } from "@/lib/voice-chat/voice-chat-types";

export type StreamVoiceChatOptions = {
  userText: string;
  history: VoiceChatTurn[];
  llmSelection?: string;
  signal: AbortSignal;
  onTextDelta: (delta: string, fullText: string) => void;
};

export async function streamVoiceChatReply(
  options: StreamVoiceChatOptions,
): Promise<string> {
  const res = await fetch("/api/voice-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userText: options.userText,
      history: options.history,
      llmSelection: options.llmSelection,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? `语音对话请求失败 (${res.status})`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("语音对话流不可用");
  }

  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const delta = decoder.decode(value, { stream: true });
    if (!delta) continue;
    fullText += delta;
    options.onTextDelta(delta, fullText);
  }

  return fullText.trim();
}
