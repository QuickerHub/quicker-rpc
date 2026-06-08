import {
  getToolOrDynamicToolName,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
  type UIMessage,
} from "ai";

export const SET_THREAD_TITLE_TOOL = "set_thread_title";
import { sanitizeThreadTitle } from "@/lib/thread-title";
import { isStructuredToolResult } from "@/lib/tool-result";

function readTitleFromSetThreadTitleOutput(output: unknown): string | null {
  if (!isStructuredToolResult(output) || !output.ok) return null;
  const data = output.data;
  if (typeof data !== "object" || data === null) return null;
  const title = (data as Record<string, unknown>).title;
  if (typeof title !== "string" || !title.trim()) return null;
  const sanitized = sanitizeThreadTitle(title);
  return sanitized === "新对话" ? null : sanitized;
}

/** True when this /api/chat request is the user's first message in the thread. */
export function isFirstChatUserTurn(messages: UIMessage[]): boolean {
  let userCount = 0;
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (isTextUIPart(part) && part.text.trim()) {
        userCount++;
        break;
      }
    }
  }
  return userCount === 1;
}

/** Latest successful set_thread_title from assistant messages (if any). */
export function extractThreadTitleFromMessages(
  messages: UIMessage[],
): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]!;
    if (message.role !== "assistant") continue;
    for (let j = message.parts.length - 1; j >= 0; j -= 1) {
      const part = message.parts[j]!;
      if (!isToolOrDynamicToolUIPart(part)) continue;
      if (getToolOrDynamicToolName(part) !== SET_THREAD_TITLE_TOOL) continue;
      if (part.state !== "output-available") continue;
      const title = readTitleFromSetThreadTitleOutput(part.output);
      if (title) return title;
    }
  }

  return null;
}
