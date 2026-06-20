import "server-only";

import type { AgentUIMessage } from "@/lib/chat-types";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";
import { resolveChatModelForSelection, resolveLlmSelection } from "@/lib/llm";
import { parseLlmProviderId } from "@/lib/llm-providers";
import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import { prepareContextPipeline } from "@/lib/agent-harness/context-pipeline";
import { buildPostCompactReinjectBlock } from "@/lib/context-compaction-reinject.server";
import { previewContextCompression } from "@/lib/context-compression";
import { repairInterruptedToolCalls } from "@/lib/repair-interrupted-tool-calls";

export const maxDuration = 120;

/** Dev/manual: preview or force L2 compression without streaming a chat turn. */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not available in production" }, { status: 404 });
  }

  try {
    const body = (await req.json()) as {
      messages: AgentUIMessage[];
      llmSelection?: string;
      llmProvider?: string;
      workingDirectory?: string;
      workspaceRoot?: string;
      threadId?: string;
      force?: boolean;
    };

    const messages = repairInterruptedToolCalls(body.messages ?? []);
    const cwd = resolveEffectiveWorkingDirectory(
      body.workingDirectory ?? body.workspaceRoot,
    );
    void cwd;

    const selection = resolveLlmSelection(
      body.llmSelection ?? body.llmProvider,
      parseLlmProviderId(body.llmProvider),
    );
    const { model, modelId } = await resolveChatModelForSelection(selection);
    const contextLimit = resolveModelContextLimit(modelId).tokens;

    const preview = previewContextCompression(messages, contextLimit);

    if (body.force !== true) {
      return Response.json({
        preview,
        modelId,
        contextLimit,
      });
    }

    const prepared = await prepareContextPipeline({
      messages,
      model,
      contextLimit,
      threadId: body.threadId,
      force: true,
      reinjectRecentPatches: buildPostCompactReinjectBlock,
      usageTracking: { selection, modelId },
    });

    return Response.json({
      preview,
      modelId,
      contextLimit,
      compressed: prepared.compressed,
      contextCompression: prepared.contextCompression,
      modelMessageCount: prepared.modelMessages.length,
      slidingWindowApplied: prepared.slidingWindowApplied,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
