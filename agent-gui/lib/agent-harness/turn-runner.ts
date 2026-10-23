import { createUIMessageStream, createUIMessageStreamResponse, type LanguageModel } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { AgentRequestContext } from "@/lib/qkrpc-request-context";
import type { ResolvedAgentTurnRequest } from "./turn-request.server";
import type { PreparedAgentTurnRuntime, ResolvedAgentTurnScope } from "./turn-runtime.server";
import type { AgentStreamLoopParams } from "./stream-loop.server";
import type { ChatPostBody } from "./types";
import { toolExecutionContextToAgentRequest } from "./tool-execution-context";
import { createAgentTurnLifecycle, withAgentTurnCancellation } from "./turn-lifecycle";

/** Ports keep orchestration tests independent of model config, user databases and host tools. */
export type AgentTurnServices = {
  resolveRequest: (body: ChatPostBody) => Promise<ResolvedAgentTurnRequest>;
  tryDirectResponse: (request: ResolvedAgentTurnRequest) => Promise<Response | null>;
  resolveModel: (request: ResolvedAgentTurnRequest) => Promise<{ model: LanguageModel; modelId: string } | Response>;
  resolveScope: (request: ResolvedAgentTurnRequest, abortSignal: AbortSignal) => Promise<ResolvedAgentTurnScope>;
  prepareRuntime: (params: {
    request: ResolvedAgentTurnRequest;
    scope: ResolvedAgentTurnScope;
    model: LanguageModel;
    modelId: string;
    abortSignal: AbortSignal;
  }) => Promise<PreparedAgentTurnRuntime>;
  runLoop: (params: AgentStreamLoopParams) => Promise<unknown>;
  withContext: <T>(context: AgentRequestContext, run: () => Promise<T>) => Promise<T>;
  clearTurnFlags: (threadId: string | undefined) => void;
  onCleanupError?: (error: unknown) => void;
};

/** One request owns one cancellation signal; hiding a conversation does not cancel it. */
export function createAgentTurnRunner(services: AgentTurnServices) {
  return async (body: ChatPostBody, options: { abortSignal?: AbortSignal } = {}): Promise<Response> => {
    const lifecycle = createAgentTurnLifecycle({
      abortSignal: options.abortSignal,
      onCleanupError: services.onCleanupError,
    });
    const { signal } = lifecycle;
    const ownResponse = async (response: Response): Promise<Response> => {
      // Register a late response body before observing cancellation during preparation.
      if (response.body) {
        const owned = new Response(withAgentTurnCancellation(response.body, lifecycle), response);
        signal.throwIfAborted();
        return owned;
      }
      signal.throwIfAborted();
      await lifecycle.dispose();
      return response;
    };
    try {
      signal.throwIfAborted();
      const request = await services.resolveRequest(body);
      signal.throwIfAborted();
      return await services.withContext({
        cwd: request.cwd,
        chatMode: request.chatMode,
        lastUserText: request.lastUserText,
        llmSelectionRaw: request.llmSelectionRaw,
        benchMode: request.benchMode,
        abortSignal: signal,
      }, async () => {
        const directResponse = await services.tryDirectResponse(request);
        if (directResponse) return ownResponse(directResponse);
        signal.throwIfAborted();
        const modelResolution = await services.resolveModel(request);
        if (modelResolution instanceof Response) return ownResponse(modelResolution);
        signal.throwIfAborted();
        services.clearTurnFlags(request.threadId);
        const scope = await services.resolveScope(request, signal);
        signal.throwIfAborted();
        return services.withContext({
          ...toolExecutionContextToAgentRequest(scope.toolExecutionContext),
          abortSignal: signal,
        }, async () => {
          const runtime = await services.prepareRuntime({ request, scope, ...modelResolution, abortSignal: signal });
          const { dispose, ...streamRuntime } = runtime;
          let disposal: Promise<void> | undefined;
          const disposeRuntime = () => disposal ??= Promise.resolve().then(dispose);
          await lifecycle.defer(disposeRuntime);
          signal.throwIfAborted();
          const stream = createUIMessageStream<AgentUIMessage>({
            originalMessages: request.repairedMessages,
            execute: async ({ writer }) => {
              try {
                await services.runLoop({ writer, ...streamRuntime, abortSignal: signal });
              } finally {
                // Release transports when production finishes, without discarding buffered UI chunks.
                try { await disposeRuntime(); } catch (error) {
                  try { services.onCleanupError?.(error); } catch { /* Preserve the turn outcome. */ }
                }
              }
            },
          });
          const response = createUIMessageStreamResponse({ stream });
          return ownResponse(response);
        });
      });
    } catch (error) {
      await lifecycle.dispose();
      throw error;
    }
  };
}
