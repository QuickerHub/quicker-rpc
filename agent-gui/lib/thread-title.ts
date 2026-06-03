import { isTextUIPart } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { parseUserMessageContent } from "@/lib/compose-user-message";

const MAX_TITLE_CHARS = 36;
const MAX_CONTEXT_CHARS = 1_200;
const DEFAULT_THREAD_TITLE = "新对话";

/** First user turn as a short title (tags → action names; no LLM). */
export function deriveProvisionalThreadTitle(
  messages: AgentUIMessage[],
): string {
  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts) {
      if (!isTextUIPart(part)) continue;
      const raw = part.text.trim();
      if (!raw) continue;

      const { tags, body } = parseUserMessageContent(raw);
      let line = "";
      if (tags.length > 0) {
        const tagHint = tags.map((t) => t.title).join("、");
        line = body ? `${tagHint}：${body}` : tagHint;
      } else {
        line = body || raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      }
      if (!line) continue;
      return sanitizeThreadTitle(line);
    }
  }
  return DEFAULT_THREAD_TITLE;
}

/** Plain user/assistant text for title generation (no tool parts). */
export function extractTitleConversationText(
  messages: AgentUIMessage[],
): string {
  const lines: string[] = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;

    const chunks: string[] = [];
    for (const part of message.parts) {
      if (!isTextUIPart(part)) continue;
      const raw = part.text.trim();
      if (!raw) continue;

      if (message.role === "user") {
        const { tags, body } = parseUserMessageContent(raw);
        if (tags.length > 0) {
          const tagHint = tags.map((t) => t.title).join("、");
          chunks.push(body ? `${tagHint}：${body}` : tagHint);
        } else {
          chunks.push(body || raw);
        }
      } else {
        chunks.push(raw);
      }
    }

    const line = chunks.join("\n").trim();
    if (!line) continue;

    const prefix = message.role === "user" ? "用户" : "助手";
    lines.push(`${prefix}：${line}`);

    if (lines.join("\n").length >= MAX_CONTEXT_CHARS) break;
    if (message.role === "assistant" && lines.length >= 2) break;
  }

  const text = lines.join("\n").trim();
  if (text.length <= MAX_CONTEXT_CHARS) return text;
  return `${text.slice(0, MAX_CONTEXT_CHARS)}…`;
}

function stripReasoningWrappers(text: string): string {
  return text.replace(/[\s\S]*?<\/think>/gi, "").trim();
}

export function sanitizeThreadTitle(raw: string): string {
  let title = stripReasoningWrappers(raw)
    .trim()
    .replace(/^["'「『【]+/, "")
    .replace(/["'」』】]+$/, "")
    .replace(/^title:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) return DEFAULT_THREAD_TITLE;
  if (title.length > MAX_TITLE_CHARS) {
    return `${title.slice(0, MAX_TITLE_CHARS - 1)}…`;
  }
  return title;
}

export const THREAD_TITLE_SYSTEM_PROMPT =
  "你是聊天会话标题生成器。根据对话内容生成一条简短标题。"
  + "要求：使用与用户相同的主要语言；不超过 20 个字；不要引号；不要句号或问号结尾；"
  + "只输出标题本身，不要解释或前缀。";
