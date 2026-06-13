import { isTextUIPart } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { parseUserMessageContent } from "@/lib/compose-user-message";

export type UserReplyLanguage = "zh" | "en";

function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x4e00 && code <= 0x9fff)
    || (code >= 0x3400 && code <= 0x4dbf);
}

function isLatinLetter(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x41 && code <= 0x5a)
    || (code >= 0x61 && code <= 0x7a);
}

/** Score visible user prose (not markup) for Chinese vs English reply language. */
export function scoreUserReplyLanguage(text: string): { cjk: number; latin: number } {
  let cjk = 0;
  let latin = 0;
  for (const ch of text) {
    if (isCjk(ch)) cjk += 1;
    else if (isLatinLetter(ch)) latin += 1;
  }
  return { cjk, latin };
}

function resolveLanguageFromScores(cjk: number, latin: number): UserReplyLanguage | null {
  if (cjk === 0 && latin === 0) return null;
  if (cjk === 0) return "en";
  if (latin === 0) return "zh";
  // Mixed prose with any CJK → Chinese reply (English tokens are usually identifiers).
  return "zh";
}

export function inferUserReplyLanguage(text: string): UserReplyLanguage | null {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2) return null;

  const { cjk, latin } = scoreUserReplyLanguage(trimmed);
  return resolveLanguageFromScores(cjk, latin);
}

function extractUserText(message: AgentUIMessage): string {
  const chunks: string[] = [];
  for (const part of message.parts) {
    if (!isTextUIPart(part)) continue;
    const raw = part.text.trim();
    if (!raw) continue;
    const { tags, body } = parseUserMessageContent(raw);
    if (tags.length > 0) {
      const tagHint = tags.map((t) => t.title).join(" ");
      chunks.push(body ? `${tagHint} ${body}` : tagHint);
    } else {
      chunks.push(body || raw.replace(/<[^>]*>/g, " "));
    }
  }
  return chunks.join("\n").replace(/\s+/g, " ").trim();
}

/** Prefer recent user turns; skips assistant/tool-only tail. */
export function inferUserReplyLanguageFromMessages(
  messages: AgentUIMessage[],
): UserReplyLanguage | null {
  const samples: string[] = [];
  for (let i = messages.length - 1; i >= 0 && samples.length < 4; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const text = extractUserText(message);
    if (text.length >= 2) samples.push(text);
  }
  if (samples.length === 0) return null;

  let cjk = 0;
  let latin = 0;
  for (const sample of samples) {
    const score = scoreUserReplyLanguage(sample);
    cjk += score.cjk;
    latin += score.latin;
  }
  return resolveLanguageFromScores(cjk, latin);
}

export function formatUserLanguageForSystem(language: UserReplyLanguage): string {
  if (language === "zh") {
    return [
      "## Reply language",
      "The user writes in **Chinese**. Every user-visible assistant sentence must be Chinese only",
      "(including brief status before/after tool calls in the same turn).",
      "Do not mix English narration with Chinese in one reply or across consecutive lines.",
      "Keep code, enum names, file paths, and product names (Quicker, qkrpc) as written.",
    ].join("\n");
  }

  return [
    "## Reply language",
    "The user writes in **English**. Every user-visible assistant sentence must be English only",
    "(including brief status before/after tool calls in the same turn).",
    "Do not mix Chinese narration with English in one reply or across consecutive lines.",
    "Keep code, enum names, file paths, and product names as written.",
  ].join("\n");
}
