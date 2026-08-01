import "server-only";

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
} from "ai";

import type { AgentUIMessage } from "@/lib/chat-types";
import { CHAT_MODE_LAUNCHER } from "@/lib/chat-mode";
import {
  isLlmSelectionConfigured,
  resolveChatModelForSelection,
} from "@/lib/llm";
import { isLlmProviderHidden } from "@/lib/llm-config";
import { clearProgramTurnFlagsForThread } from "@/lib/program-turn-context";
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
import { toolExecutionContextToAgentRequest } from "@/lib/agent-harness/tool-execution-context";
import type { ChatPostBody } from "@/lib/agent-harness/types";

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

/** Main agent chat turn: resolve request -> prepare runtime -> run SDK agent. */
export async function runAgentChatTurn(body: ChatPostBody): Promise<Response> {
  const request = await resolveAgentTurnRequest(body);
  const directResponse = await tryLauncherDirectResponse(request);
  if (directResponse) return directResponse;

  const modelResolution = await resolveTurnModel(request);
  if (modelResolution instanceof Response) return modelResolution;

  clearProgramTurnFlagsForThread(request.threadId);

  return runWithAgentRequestContextAsync(
    {
      cwd: request.cwd,
      chatMode: request.chatMode,
      lastUserText: request.lastUserText,
      llmSelectionRaw: request.llmSelectionRaw,
      benchMode: request.benchMode,
    },
    async () => {
      const scope = await resolveAgentTurnScope(request);

      return runWithAgentRequestContextAsync(
        toolExecutionContextToAgentRequest(scope.toolExecutionContext),
        async () => {
          const runtime = await prepareAgentTurnRuntime({
            request,
            scope,
            ...modelResolution,
          });
          const { dispose, ...streamRuntime } = runtime;
          const stream = createUIMessageStream<AgentUIMessage>({
            originalMessages: request.repairedMessages,
            execute: async ({ writer }) => {
              try {
                await runAgentStreamLoop({ writer, ...streamRuntime });
              } finally {
                await dispose();
              }
            },
          });

          return createUIMessageStreamResponse({ stream });
        },
      );
    },
  );
}
