import "server-only";
import { randomUUID } from "node:crypto";

import type { LanguageModel } from "ai";
import { CHAT_MODE_LAUNCHER } from "@/lib/chat-mode";
import {
  isLlmSelectionConfigured,
  resolveChatModelForSelection,
} from "@/lib/llm";
import { isLlmProviderHidden } from "@/lib/llm-config";
import { runWithAgentRequestContextAsync } from "@/lib/qkrpc-request-context";
import { tryRespondWithLauncherCacheDirect } from "@/lib/launcher/launcher-cache-direct.server";
import { tryRespondWithLauncherResolveDirect } from "@/lib/launcher/launcher-resolve-direct.server";
import { runAgentStreamLoop } from "@/lib/agent-harness/stream-loop.server";
import {
  resolveAgentTurnRequest,
  type ResolvedAgentTurnRequest,
} from "@/lib/agent-harness/turn-request.server";
import {
  prepareAgentTurnRuntime,
  resolveAgentTurnScope,
} from "@/lib/agent-harness/turn-runtime.server";
import { createAgentTurnRunner } from "@/lib/agent-harness/turn-runner";

async function tryLauncherDirectResponse(
  request: ResolvedAgentTurnRequest,
): Promise<Response | null> {
  if (request.chatMode !== CHAT_MODE_LAUNCHER || request.titleTest) {
    return null;
  }

  return runWithAgentRequestContextAsync(
    {
      cwd: request.cwd,
      chatMode: request.chatMode,
      lastUserText: request.lastUserText,
    },
    async () => {
      const cacheDirect = await tryRespondWithLauncherCacheDirect({
        userText: request.lastUserText,
        repairedMessages: request.repairedMessages,
        cwd: request.cwd,
      });
      if (cacheDirect) return cacheDirect;
      return tryRespondWithLauncherResolveDirect({
        userText: request.lastUserText,
        repairedMessages: request.repairedMessages,
        cwd: request.cwd,
      });
    },
  );
}

async function resolveTurnModel(
  request: ResolvedAgentTurnRequest,
): Promise<{ model: LanguageModel; modelId: string } | Response> {
  if (
    request.selection.kind === "builtin"
    && isLlmProviderHidden(request.selection.providerId)
  ) {
    return Response.json(
      { error: `Provider "${request.selection.providerId}" is not available` },
      { status: 400 },
    );
  }
  if (!isLlmSelectionConfigured(request.selection)) {
    return Response.json(
      { error: "Model selection is not configured" },
      { status: 400 },
    );
  }

  try {
    return await resolveChatModelForSelection(request.selection);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Concrete server adapters for the single AI SDK agent execution path. */
export const runAgentChatTurn = createAgentTurnRunner({
  createExecutionId: randomUUID,
  createTraceRunId: randomUUID,
  resolveRequest: resolveAgentTurnRequest,
  tryDirectResponse: tryLauncherDirectResponse,
  resolveModel: resolveTurnModel,
  resolveScope: resolveAgentTurnScope,
  prepareRuntime: prepareAgentTurnRuntime,
  runLoop: runAgentStreamLoop,
  withContext: runWithAgentRequestContextAsync,
  onCleanupError: (error) => console.error("[agent turn cleanup]", error),
});
