import {
  stepCountIs,
  ToolLoopAgent,
  type ToolSet,
  type UIMessageStreamWriter,
} from "ai";
import type { LanguageModel } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { ChatMode } from "@/lib/chat-mode";
import { maxStepsForChatMode } from "@/lib/chat-mode";
import {
  buildTurnContextReport,
  reconcileTurnContextReportWithApiUsage,
} from "@/lib/agent-harness/context-report";
import type { PreparedModelContext } from "@/lib/agent-harness/types";
import type { PreparedChatContext } from "@/lib/agent-turn-runtime";
import type { AgentRuntimeSnapshot } from "@/lib/agent-runtime-snapshot";
import { mergeUIMessageStreamWithReactiveCompact } from "@/lib/context-compression-reactive";
import { createStepMicrocompactPrepareStep } from "@/lib/context-step-microcompact";
import type { PrepareCompressedContextOptions } from "@/lib/context-compression";
import { createRepairToolCallHandler } from "@/lib/repair-tool-call";
import type { RecordManagedLlmUsageInput } from "@/lib/llm-usage-tracker.server";
import type { LlmSelection } from "@/lib/llm-selection";
import { createAgentTurnLifecycle } from "./turn-lifecycle";

export type AgentStreamLoopParams = {
  abortSignal?: AbortSignal;
  writer: UIMessageStreamWriter<AgentUIMessage>;
  model: LanguageModel;
  modelId: string;
  contextLimit: number;
  tools: ToolSet;
  chatMode: ChatMode;
  titleTest: boolean;
  selection: LlmSelection;
  compressionBase: Omit<
    PrepareCompressedContextOptions,
    "reinjectRecentPatches" | "force" | "reactiveCompactAttempted"
  >;
  preparedContext: PreparedModelContext;
  buildSystemForPreparedContext: (context: PreparedChatContext) => string;
  runtimeSnapshot: AgentRuntimeSnapshot;
};

export type AgentStreamLoopServices = {
  recordUsage: (input: RecordManagedLlmUsageInput) => void;
  prepareContext: (options: AgentStreamLoopParams["compressionBase"] & {
    force: true;
    reactiveCompactAttempted: true;
  }) => Promise<PreparedModelContext>;
};

/** AI SDK agent loop + project-specific reactive compaction retry. */
export async function runAgentStreamLoopCore(
  params: AgentStreamLoopParams,
  services: AgentStreamLoopServices,
): Promise<PreparedModelContext> {
  let preparedContext = params.preparedContext;
  let reactiveCompactAttempted = false;

  while (true) {
    params.abortSignal?.throwIfAborted();
    const attempt = createAgentTurnLifecycle({ abortSignal: params.abortSignal });
    try {
      const system = params.buildSystemForPreparedContext(preparedContext);
      const buildContextReportForStep = (modelMessages: typeof preparedContext.modelMessages) =>
        buildTurnContextReport({
          system,
          tools: params.tools,
          modelMessages,
          contextLimit: params.contextLimit,
          contextCompression: preparedContext.contextCompression,
          slidingWindowApplied: preparedContext.slidingWindowApplied,
        });

      let stepModelMessages = preparedContext.modelMessages;
      let latestContextReport = buildContextReportForStep(stepModelMessages);
      const microcompactPrepareStep = createStepMicrocompactPrepareStep({
        contextLimit: params.contextLimit,
      });

      const agent = new ToolLoopAgent({
        id: "quicker-agent",
        model: params.model,
        instructions: system,
        tools: params.tools,
        experimental_repairToolCall: createRepairToolCallHandler(params.tools),
        prepareStep: (options) => {
          stepModelMessages = options.messages;
          const prepared = microcompactPrepareStep(options);
          if (prepared?.messages) {
            stepModelMessages = prepared.messages;
          }
          return prepared;
        },
        onStepFinish: ({ usage }) => {
          latestContextReport = reconcileTurnContextReportWithApiUsage(
            buildContextReportForStep(stepModelMessages),
            usage.inputTokens,
          );
        },
        stopWhen: stepCountIs(
          params.titleTest ? 3 : maxStepsForChatMode(params.chatMode),
        ),
        onFinish: ({ totalUsage }) => {
          services.recordUsage({
            selection: params.selection,
            modelId: params.modelId,
            source: "chat",
            inputTokens: totalUsage.inputTokens,
            outputTokens: totalUsage.outputTokens,
            totalTokens: totalUsage.totalTokens,
            reasoningTokens: totalUsage.reasoningTokens,
          });
        },
      });
      const result = await agent.stream({
        messages: preparedContext.modelMessages,
        abortSignal: attempt.signal,
      });

      const uiStream = result.toUIMessageStream<AgentUIMessage>({
        sendReasoning: true,
        messageMetadata: ({ part }) => {
          if (part.type === "start") {
            return {
              model: params.modelId,
              contextCompression: preparedContext.contextCompression,
              contextReport: latestContextReport,
              agentTurnState: params.runtimeSnapshot.turnState,
              recoveryDecision: params.runtimeSnapshot.recoveryDecision,
              recentToolFeedbackCount:
                params.runtimeSnapshot.recentToolFeedbackCount,
            };
          }
          if (part.type === "finish-step" && part.usage) {
            const u = part.usage;
            return {
              model: params.modelId,
              inputTokens: u.inputTokens,
              outputTokens: u.outputTokens,
              totalTokens: u.totalTokens,
              reasoningTokens: u.reasoningTokens,
              contextReport: latestContextReport,
            };
          }
          if (part.type === "finish") {
            return { model: params.modelId };
          }
          return undefined;
        },
      });

      const mergeResult = await mergeUIMessageStreamWithReactiveCompact(
        uiStream.getReader(),
        params.writer,
        {
          allowReactiveRetry: !reactiveCompactAttempted,
          abortSignal: params.abortSignal,
          onRetry: () => attempt.abort(new DOMException("Retrying with compacted context", "AbortError")),
        onStreamError: (error) => attempt.abort(error),
        },
      );

      if (mergeResult.action === "retry") {
        reactiveCompactAttempted = true;
        // Stop the rejected model attempt before compaction starts another call.
        params.abortSignal?.throwIfAborted();
        preparedContext = await services.prepareContext({
          ...params.compressionBase,
          abortSignal: params.abortSignal,
          force: true,
          reactiveCompactAttempted: true,
        });
        params.abortSignal?.throwIfAborted();
        continue;
      }

      break;
    } catch (error) {
      attempt.abort(error);
      throw error;
    } finally {
      await attempt.dispose();
    }
  }

  return preparedContext;
}
