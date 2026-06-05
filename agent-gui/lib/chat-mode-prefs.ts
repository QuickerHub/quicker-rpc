import {
  CHAT_MODE_AGENT,
  isChatMode,
  resolveChatMode,
  type ChatMode,
} from "@/lib/chat-mode";

export const CHAT_MODE_STORAGE_KEY = "agent-gui-chat-mode";

export function loadStoredChatMode(): ChatMode {
  if (typeof window === "undefined") return CHAT_MODE_AGENT;
  try {
    const raw = localStorage.getItem(CHAT_MODE_STORAGE_KEY);
    return resolveChatMode(raw ?? undefined);
  } catch {
    return CHAT_MODE_AGENT;
  }
}

export function storeChatMode(mode: ChatMode): void {
  if (typeof window === "undefined") return;
  if (!isChatMode(mode)) return;
  try {
    localStorage.setItem(CHAT_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
