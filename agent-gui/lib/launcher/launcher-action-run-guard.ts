import type { ChatMode } from "@/lib/chat-mode";
import { CHAT_MODE_LAUNCHER } from "@/lib/chat-mode";
import { findQkaMarkupMatches, parseQkaRefFromAttrs } from "@/lib/qka-markup";
import type { LauncherResolveAgentNext } from "@/lib/launcher/launcher-resolve-agent-output";

/** User phrasing that names a category, not one specific action. */
const VAGUE_RUN_MARKERS =
  /相关|之类|类似|什么的|哪个|某一|某个|随便|之类|about|related to|something/i;

const RUN_VERB_MARKERS = /运行|执行|启动|跑一下|run\b|execute\b/i;

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s_\-·•,，。！？!?'"「」【】()（）[\]]+/g, " ")
    .trim();
}

export function extractQkaActionIdsFromText(text: string): string[] {
  const ids: string[] = [];
  for (const match of findQkaMarkupMatches(text)) {
    const ref = parseQkaRefFromAttrs(match.attrs, match.innerText);
    if (ref?.id) ids.push(ref.id.toLowerCase());
  }
  return ids;
}

export function isLauncherVagueRunIntent(userText: string): boolean {
  const text = userText.trim();
  if (!text) return false;
  if (VAGUE_RUN_MARKERS.test(text)) return true;
  if (!RUN_VERB_MARKERS.test(text)) return false;
  if (extractQkaActionIdsFromText(text).length > 0) return false;
  // Run verb + short generic topic without a specific action name.
  const withoutVerbs = text.replace(RUN_VERB_MARKERS, " ").trim();
  const tokens = normalizeForMatch(withoutVerbs).split(/\s+/).filter(Boolean);
  return tokens.length <= 2;
}

function readActionIdFromResolveNext(
  next: LauncherResolveAgentNext | null | undefined,
): string | null {
  if (!next?.input || typeof next.input !== "object") return null;
  const id = (next.input as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id.trim().toLowerCase() : null;
}

function userMentionsActionTitle(userText: string, actionTitle: string): boolean {
  const title = actionTitle.trim();
  if (!title) return false;
  const user = normalizeForMatch(userText);
  const normalizedTitle = normalizeForMatch(title);
  if (normalizedTitle.length >= 4 && user.includes(normalizedTitle)) {
    return true;
  }
  const titleTokens = normalizedTitle
    .split(/\s+/)
    .filter((token) => token.length >= 4);
  return titleTokens.some((token) => user.includes(token));
}

export type LauncherActionRunGuardInput = {
  chatMode?: ChatMode;
  userText?: string;
  actionId: string;
  actionTitle?: string;
  launcherResolveDirectNext?: LauncherResolveAgentNext | null;
};

export type LauncherActionRunGuardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/** Block launcher auto-run when intent or match confidence is insufficient. */
export function checkLauncherActionRunAllowed(
  input: LauncherActionRunGuardInput,
): LauncherActionRunGuardResult {
  if (input.chatMode !== CHAT_MODE_LAUNCHER) {
    return { allowed: true };
  }

  const actionId = input.actionId.trim().toLowerCase();
  const userText = input.userText?.trim() ?? "";

  if (extractQkaActionIdsFromText(userText).includes(actionId)) {
    return { allowed: true };
  }

  const resolveId = readActionIdFromResolveNext(input.launcherResolveDirectNext);
  if (resolveId && resolveId === actionId) {
    return { allowed: true };
  }

  if (input.actionTitle && userMentionsActionTitle(userText, input.actionTitle)) {
    return { allowed: true };
  }

  if (isLauncherVagueRunIntent(userText)) {
    return {
      allowed: false,
      reason:
        "Launcher blocked auto-run: user intent is category-level or ambiguous. "
        + "Call ask_question with ranked matches; do not qkrpc_action_run until the user picks.",
    };
  }

  return {
    allowed: false,
    reason:
      "Launcher blocked auto-run: action was not explicitly named (@ mention or exact title). "
      + "Use launcher_resolve or ask_question first.",
  };
}

export function shouldBlockLauncherActionQueryAutoRun(params: {
  chatMode?: ChatMode;
  userText?: string;
  matchCount: number;
}): { blocked: boolean; reason?: string } {
  if (params.chatMode !== CHAT_MODE_LAUNCHER) {
    return { blocked: false };
  }
  const userText = params.userText?.trim() ?? "";
  if (isLauncherVagueRunIntent(userText)) {
    return {
      blocked: true,
      reason:
        "User intent is vague — present matches via ask_question; do not run until confirmed.",
    };
  }
  if (params.matchCount > 1) {
    return {
      blocked: true,
      reason:
        "Multiple matches — use ask_question to disambiguate before qkrpc_action_run.",
    };
  }
  return { blocked: false };
}
