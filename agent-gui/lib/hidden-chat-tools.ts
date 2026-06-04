import { SET_THREAD_TITLE_TOOL } from "@/lib/thread-title-tool-messages";

/** Tools always available to the model but not rendered in chat UI. */
const HIDDEN_CHAT_TOOLS = new Set<string>([SET_THREAD_TITLE_TOOL]);

export function isHiddenChatTool(toolName: string): boolean {
  return HIDDEN_CHAT_TOOLS.has(toolName);
}
