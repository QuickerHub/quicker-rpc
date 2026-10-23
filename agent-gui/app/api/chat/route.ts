import { runAgentChatTurn } from "@/lib/agent-harness/run-turn.server";
import { createAgentChatHandler } from "@/lib/agent-service/chat-handler";

export const maxDuration = 120;

export const POST = createAgentChatHandler({
  runTurn: runAgentChatTurn,
  onError: (error) => console.error("[/api/chat]", error),
});
