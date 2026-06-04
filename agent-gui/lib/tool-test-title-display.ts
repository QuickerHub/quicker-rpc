import type { AgentUIMessage } from "@/lib/chat-types";
import type { TitleTestRunEntry } from "@/lib/tool-test-title-runs";

/** Live stream messages, or a user preview while waiting for /api/chat. */
export function buildTitleTestDisplayMessages(
  run: TitleTestRunEntry,
): AgentUIMessage[] {
  const live = run.chatMessages ?? [];
  if (live.length > 0) return live;

  const text = (run.requestPayload ?? run.userText).trim();
  if (!text) return [];

  return [
    {
      id: `${run.id}-preview-user`,
      role: "user",
      parts: [{ type: "text", text }],
    },
  ];
}
