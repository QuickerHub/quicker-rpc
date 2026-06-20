import { withReleasePreviewRoute } from "@/lib/release-preview.server";
import { runAgentChatTurn } from "@/lib/agent-harness/run-turn.server";
import type { ChatPostBody } from "@/lib/agent-harness/types";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    return await withReleasePreviewRoute(async () => {
      const body = (await req.json()) as ChatPostBody;
      return runAgentChatTurn(body);
    });
  } catch (e) {
    console.error("[/api/chat]", e);
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
