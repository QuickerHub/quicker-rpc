import "server-only";

import type { LanguageModel } from "ai";

import { extractActionScopeFromMessages } from "@/lib/action-scope";
import { resolveTurnPlan } from "@/lib/agent-core/turn-plan";
import { buildAgentRuntimeSnapshot } from "@/lib/agent-runtime-snapshot";
import {
  createChatSystemBuilder,
  selectChatTools,
} from "@/lib/agent-turn-runtime";
import { CHAT_MODE_LAUNCHER } from "@/lib/chat-mode";
import { buildPostCompactReinjectBlock } from "@/lib/context-compaction-reinject.server";
import { fetchDesignerContextSnapshot } from "@/lib/designer-context.server";
import { resolveDesignerWindowContext } from "@/lib/designer-embed-layout";
import {
  formatDesignerEmbedContextForSystem,
  mergeDesignerDefaultActionScope,
} from "@/lib/designer-embed-prompt";
import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import { prepareContextPipeline } from "@/lib/agent-harness/context-pipeline";
import { slimToolsForModel } from "@/lib/agent-harness/model-tool-definitions";
import type { AgentStreamLoopParams } from "@/lib/agent-harness/stream-loop.server";
import {
  buildToolExecutionContext,
  type ToolExecutionContext,
} from "@/lib/agent-harness/tool-execution-context";
import type { ResolvedAgentTurnRequest } from "@/lib/agent-harness/turn-request.server";

export type ResolvedAgentTurnScope = {
  actionScope: ReturnType<typeof extractActionScopeFromMessages>;
  designerEmbedBlock?: string;
  toolExecutionContext: ToolExecutionContext;
};

export type PreparedAgentTurnRuntime = Omit<AgentStreamLoopParams, "writer">;

/** Resolve designer state and the explicit context passed to every tool call. */
export async function resolveAgentTurnScope(
  request: ResolvedAgentTurnRequest,
): Promise<ResolvedAgentTurnScope> {
  let actionScope = extractActionScopeFromMessages(request.messagesForModel);
  let designerEmbedBlock: string | undefined;

  if (request.actionDesigner && request.chatMode !== CHAT_MODE_LAUNCHER) {
    const designerSnapshot = await fetchDesignerContextSnapshot(false);
    const windowContext = resolveDesignerWindowContext(designerSnapshot, {
      scoped: request.body.designerEmbedScoped === true,
      entityId: request.actionDesigner.entityId,
      isSubProgram: request.actionDesigner.isSubProgram,
    });
    designerEmbedBlock = formatDesignerEmbedContextForSystem(
      request.actionDesigner,
      windowContext,
    ) || undefined;
    actionScope = mergeDesignerDefaultActionScope(
      actionScope,
      request.actionDesigner,
      windowContext?.title,
    );
  }

  return {
    actionScope,
    designerEmbedBlock,
    toolExecutionContext: buildToolExecutionContext({
      cwd: request.cwd,
      chatMode: request.chatMode,
      actionScope,
      threadId: request.threadId,
      lastUserText: request.lastUserText,
      llmSelectionRaw: request.llmSelectionRaw,
      benchMode: request.benchMode,
    }),
  };
}

/** Prepare tools, context budget, turn policy and system prompt for the SDK agent. */
export async function prepareAgentTurnRuntime(params: {
  request: ResolvedAgentTurnRequest;
  scope: ResolvedAgentTurnScope;
  model: LanguageModel;
  modelId: string;
}): Promise<PreparedAgentTurnRuntime> {
  const { request, scope, model, modelId } = params;
  const turnPlan = resolveTurnPlan({
    actionScope: scope.actionScope,
    chatMode: request.chatMode,
    enabledToolIds: request.enabledToolIds,
    messages: request.repairedMessages,
    userText: request.lastUserText,
    actionDesigner: request.actionDesigner,
  });
  const fullTools = selectChatTools({
    chatMode: request.chatMode,
    enabledToolIds: request.enabledToolIds,
    titleTest: request.titleTest,
    benchMode: request.benchMode,
  });
  const modelTools = slimToolsForModel(
    fullTools,
    new Set(turnPlan.fullSchemaToolIds),
  );
  const enabledRuntimeToolIds = Object.keys(fullTools);
  const contextLimit = resolveModelContextLimit(modelId).tokens;
  const compressionBase = {
    messages: request.messagesForModel,
    model,
    contextLimit,
    threadId: request.threadId,
    usageTracking: {
      selection: request.selection,
      modelId,
    },
  } as const;
  const preparedContext = await prepareContextPipeline({
    ...compressionBase,
    reinjectRecentPatches: buildPostCompactReinjectBlock,
    force:
      process.env.NODE_ENV !== "production"
      && request.body.contextCompressionForce === true,
  });
  const runtimeSnapshot = buildAgentRuntimeSnapshot({
    actionScope: scope.actionScope,
    chatMode: request.chatMode,
    enabledToolIds: enabledRuntimeToolIds,
    messages: request.repairedMessages,
    userText: request.lastUserText,
    turnPlan,
  });
  const buildSystemForPreparedContext = await createChatSystemBuilder({
    actionScope: scope.actionScope,
    chatMode: request.chatMode,
    cwd: request.cwd,
    designerEmbedBlock: scope.designerEmbedBlock,
    enabledToolIds: enabledRuntimeToolIds,
    launcherUserText: request.lastUserText,
    modelId,
    repairedMessages: request.repairedMessages,
    slashCommandName: request.slashCommand.commandName,
    titleManual: request.body.titleManual === true,
    titleTest: request.titleTest,
    benchMode: request.benchMode,
  });

  return {
    model,
    modelId,
    contextLimit,
    tools: modelTools,
    chatMode: request.chatMode,
    titleTest: request.titleTest,
    selection: request.selection,
    compressionBase,
    preparedContext,
    buildSystemForPreparedContext,
    runtimeSnapshot,
  };
}
