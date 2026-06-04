import { isTextUIPart } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { parseUserMessageContent } from "@/lib/compose-user-message";
import {
  isTitleWithinSidebarLimit,
  SIDEBAR_TITLE_LENGTH_HINT,
  truncateTitleToDisplayUnits,
} from "@/lib/thread-title-display";

export {
  isTitleWithinSidebarLimit,
  measureTitleDisplayUnits,
  MAX_SIDEBAR_TITLE_DISPLAY_UNITS,
  MIN_SIDEBAR_TITLE_DISPLAY_UNITS,
  SIDEBAR_TITLE_LENGTH_HINT,
} from "@/lib/thread-title-display";
/** Per user/assistant line sent to the title model. */
const MAX_TITLE_LINE_CHARS = 220;
/** Total prompt budget for /api/chat/title. */
const MAX_CONTEXT_CHARS = 480;
const DEFAULT_THREAD_TITLE = "新对话";

const VAGUE_PROVISIONAL_TITLES = new Set([
  "你好",
  "您好",
  "hi",
  "hello",
  "help",
  "test",
  "测试",
  "继续",
  "谢谢",
  "thanks",
]);

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

function truncateTitleLine(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_TITLE_LINE_CHARS) return normalized;
  return `${normalized.slice(0, MAX_TITLE_LINE_CHARS - 1)}…`;
}

function extractMessageTextLine(message: AgentUIMessage): string {
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
        chunks.push(body || raw.replace(/<[^>]*>/g, " "));
      }
    } else {
      chunks.push(stripReasoningWrappers(raw));
    }
  }
  return truncateTitleLine(chunks.join("\n"));
}

/** Plain user/assistant text for title generation (no tool parts). */
export function extractTitleConversationText(
  messages: AgentUIMessage[],
): string {
  const lines: string[] = [];
  let sawUser = false;
  let sawAssistant = false;

  for (const message of messages) {
    if (message.role === "user") {
      if (sawUser) break;
      const line = extractMessageTextLine(message);
      if (!line) continue;
      lines.push(`用户：${line}`);
      sawUser = true;
      continue;
    }

    if (message.role === "assistant") {
      if (!sawUser || sawAssistant) break;
      const line = extractMessageTextLine(message);
      if (!line) continue;
      lines.push(`助手：${line}`);
      sawAssistant = true;
      break;
    }
  }

  const text = lines.join("\n").trim();
  if (text.length <= MAX_CONTEXT_CHARS) return text;
  return `${text.slice(0, MAX_CONTEXT_CHARS)}…`;
}

/** Skip the title LLM when the first user turn already yields a usable sidebar title. */
export function isProvisionalTitleSufficient(provisional: string): boolean {
  const title = provisional.trim();
  if (!title || title === DEFAULT_THREAD_TITLE) return false;
  if (!isTitleWithinSidebarLimit(title)) return false;
  if (VAGUE_PROVISIONAL_TITLES.has(title.toLowerCase())) return false;
  return true;
}

export function extractUserLineFromTitleContext(context: string): string | null {
  for (const line of context.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("用户：")) {
      const body = trimmed.slice("用户：".length).trim();
      return body || null;
    }
  }
  return null;
}

/** True when the model title mostly repeats the user's first line. */
export function isNearVerbatimThreadTitle(
  title: string,
  userLine: string | null,
): boolean {
  if (!userLine) return false;
  const a = title.replace(/\s+/g, "").trim();
  const b = userLine.replace(/\s+/g, "").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.startsWith(a) && a.length >= 8) return true;
  if (a.startsWith(b) && b.length >= 8) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  return longer.includes(shorter) && shorter.length / longer.length >= 0.75;
}

/** Last resort when the model echoes the user line. */
export function fallbackCompressTitleFromUserLine(userLine: string): string {
  let t = userLine.replace(/\s+/g, " ").trim();
  t = t.replace(/^新建动作[：:]\s*/i, "");
  const stop = t.search(/[，,；;。]/);
  if (stop > 0) t = t.slice(0, stop);
  return sanitizeThreadTitle(t);
}

export function buildTitleRequestPayload(messages: AgentUIMessage[]): {
  provisional: string;
  context: string;
} {
  return {
    provisional: deriveProvisionalThreadTitle(messages),
    context: extractTitleConversationText(messages),
  };
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
  if (!isTitleWithinSidebarLimit(title)) {
    return truncateTitleToDisplayUnits(title) || DEFAULT_THREAD_TITLE;
  }
  return title;
}

export const THREAD_TITLE_SYSTEM_PROMPT =
  `为 Quicker 聊天侧栏写极短标题。与用户同语言；长度约 ${SIDEBAR_TITLE_LENGTH_HINT}；概括任务主题；禁止照抄或复述用户原句；无引号句号问号；只输出标题。`;

export const THREAD_TITLE_RETRY_SYSTEM_PROMPT =
  `侧栏标题必须很短（${SIDEBAR_TITLE_LENGTH_HINT}），只概括意图，绝不能复述用户原文。只输出标题。`;

export const THREAD_TITLE_RETRY_USER_PROMPT_SUFFIX =
  `Write a short sidebar title (${SIDEBAR_TITLE_LENGTH_HINT}), do not repeat the user's wording.`;