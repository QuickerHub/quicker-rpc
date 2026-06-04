import { tool } from "ai";
import type { UIMessage } from "ai";
import { z } from "zod";
import { formatLocalToolResult } from "@/lib/tool-result";
import {
  SIDEBAR_TITLE_LENGTH_HINT,
  sanitizeThreadTitle,
} from "@/lib/thread-title";
import {
  extractThreadTitleFromMessages,
  isFirstChatUserTurn,
  SET_THREAD_TITLE_TOOL,
} from "@/lib/thread-title-tool-messages";

export { SET_THREAD_TITLE_TOOL };

export const SET_THREAD_TITLE_TOOL_DEF = tool({
  description:
    "Set the sidebar chat thread title (hidden from the user). Call once early on the first user turn when the thread still has the default title. "
    + `Write a short label (${SIDEBAR_TITLE_LENGTH_HINT}); summarize intent; do not copy the user message verbatim.`,
  inputSchema: z.object({
    title: z
      .string()
      .min(1)
      .describe(
        `Short sidebar title (${SIDEBAR_TITLE_LENGTH_HINT}), same language as the user`,
      ),
  }),
  execute: async ({ title }) => {
    const sanitized = sanitizeThreadTitle(title);
    return formatLocalToolResult({
      action: SET_THREAD_TITLE_TOOL,
      success: true,
      title: sanitized,
    });
  },
});

/**
 * Inject only on the request that handles the user's first message in the thread.
 */
export function buildThreadTitleAgentInstruction(opts: {
  messages: UIMessage[];
  titleManual?: boolean;
}): string | null {
  if (opts.titleManual) return null;
  if (!isFirstChatUserTurn(opts.messages)) return null;
  if (extractThreadTitleFromMessages(opts.messages)) return null;

  return (
    "## Thread title (first user message only)\n"
    + "This is the user's first message in a new thread. Before or while you start answering, "
    + `call ${SET_THREAD_TITLE_TOOL} once with a short sidebar title (${SIDEBAR_TITLE_LENGTH_HINT}). `
    + "Summarize their goal in the same language; do not copy their wording. "
    + "The tool is hidden in the UI — do not mention it in your visible reply."
  );
}

/** /tool-test title tab: same production tool + prompt, minimal agent steps. */
export function buildTitleTestChatInstruction(): string {
  return (
    "## Thread title test (production path)\n"
    + "This request only tests sidebar title generation like a new chat's first turn. "
    + `Call ${SET_THREAD_TITLE_TOOL} once first with a short title (${SIDEBAR_TITLE_LENGTH_HINT}) `
    + "based on the user message (and assistant reply if already in context). "
    + "Then write at most one short acknowledgement sentence. "
    + "Do not call any other tools. The title tool is hidden in the UI."
  );
}
