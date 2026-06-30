import "server-only";

import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  isTextUIPart,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { extractActionScopeFromMessages } from "@/lib/action-scope";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";
import { runWithAgentRequestContextAsync } from "@/lib/qkrpc-request-context";
import { clearProgramTurnFlagsForThread } from "@/lib/program-turn-context";
import {
  isLlmSelectionConfigured,
  resolveChatModelForSelection,
  resolveLlmSelection,
} from "@/lib/llm";
import { isLlmProviderHidden } from "@/lib/llm-config";
import { parseLlmProviderId } from "@/lib/llm-providers";
import {
  CHAT_MODE_LAUNCHER,
  resolveChatMode,
  resolveEnabledToolsForChatMode,
} from "@/lib/chat-mode";
import { defaultEnabledToolIds } from "@/lib/tool-registry";
import { expandUserMessageForModel } from "@/lib/compose-user-message";
import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import { prepareContextPipeline } from "@/lib/agent-harness/context-pipeline";
import { runAgentStreamLoop } from "@/lib/agent-harness/stream-loop.server";
import {
  buildToolExecutionContext,
  toolExecutionContextToAgentRequest,
} from "@/lib/agent-harness/tool-execution-context";
import type { ChatPostBody } from "@/lib/agent-harness/types";
import { buildPostCompactReinjectBlock } from "@/lib/context-compaction-reinject.server";
import { repairInterruptedToolCalls } from "@/lib/repair-interrupted-tool-calls";
import { extractLastUserMessageText } from "@/lib/launcher/launcher-command-cache.server";
import { tryRespondWithLauncherCacheDirect } from "@/lib/launcher/launcher-cache-direct.server";
import { tryRespondWithLauncherResolveDirect } from "@/lib/launcher/launcher-resolve-direct.server";
import { parseSlashCommandInput } from "@/lib/agent-defs/command-expand";
import { expandSlashTagsInUserText } from "@/lib/composer-slash-tag";
import { resolveSlashCommandForChat } from "@/lib/agent-defs/apply-chat-command.server";
import {
  createChatSystemBuilder,
  selectChatTools,
} from "@/lib/agent-turn-runtime";
import { resolveTurnPlan } from "@/lib/agent-core/turn-plan";
import { slimToolsForModel } from "@/lib/agent-harness/model-tool-definitions";
import { buildAgentRuntimeSnapshot } from "@/lib/agent-runtime-snapshot";
import { fetchDesignerContextSnapshot } from "@/lib/designer-context.server";
import { resolveDesignerWindowContext } from "@/lib/designer-embed-layout";
import {
  formatDesignerEmbedContextForSystem,
  mergeDesignerDefaultActionScope,
  resolveActionDesignerForChatTurn,
} from "@/lib/designer-embed-prompt";

/** Main agent chat turn: launcher shortcuts, context pipeline, stream loop. */
export async function runAgentChatTurn(body: ChatPostBody): Promise<Response> {
  const chatMode = resolveChatMode(body.chatMode);
  const cwd = resolveEffectiveWorkingDirectory(
    body.workingDirectory ?? body.workspaceRoot,
  );
  const repairedMessages = repairInterruptedToolCalls(body.messages);
  const titleTest = body.titleTestOnly === true;
  const benchMode = body.benchMode === true && !titleTest;

  const resolvedEnabledTools = resolveEnabledToolsForChatMode(
    chatMode,
    body.enabledTools,
    defaultEnabledToolIds,
  );
  const slashCommand =
    chatMode !== CHAT_MODE_LAUNCHER && !titleTest
      ? await resolveSlashCommandForChat(
          repairedMessages,
          cwd,
          resolvedEnabledTools,
        )
      : { expandedUserText: null, overrides: {}, commandName: null };

  const selection = resolveLlmSelection(
    slashCommand.overrides.llmSelectionRaw
      ?? body.llmSelection
      ?? body.llmProvider,
    parseLlmProviderId(body.llmProvider),
  );

  const lastUserText = extractLastUserMessageText(repairedMessages);

  if (chatMode === CHAT_MODE_LAUNCHER && !titleTest) {
    const direct = await runWithAgentRequestContextAsync(
      { cwd, chatMode, lastUserText },
      async () => {
        const cacheDirect = await tryRespondWithLauncherCacheDirect({
          userText: lastUserText,
          repairedMessages,
          cwd,
        });
        if (cacheDirect) return cacheDirect;
        return tryRespondWithLauncherResolveDirect({
          userText: lastUserText,
          repairedMessages,
          cwd,
        });
      },
    );
    if (direct) return direct;
  }

  if (
    selection.kind === "builtin"
    && isLlmProviderHidden(selection.providerId)
  ) {
    return Response.json(
      { error: `Provider "${selection.providerId}" is not available` },
      { status: 400 },
    );
  }

  if (!isLlmSelectionConfigured(selection)) {
    return Response.json(
      { error: "Model selection is not configured" },
      { status: 400 },
    );
  }

  let model;
  let modelId: string;
  try {
    ({ model, modelId } = await resolveChatModelForSelection(selection));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }

  const effectiveEnabledTools =
    slashCommand.overrides.enabledTools ?? resolvedEnabledTools;
  const preliminaryActionScope = extractActionScopeFromMessages(repairedMessages);
  const preliminaryActionDesigner =
    chatMode !== CHAT_MODE_LAUNCHER
      ? resolveActionDesignerForChatTurn(body)
      : undefined;
  const preliminaryTurnPlan = resolveTurnPlan({
    actionScope: preliminaryActionScope,
    chatMode,
    enabledToolIds: effectiveEnabledTools,
    messages: repairedMessages,
    userText: lastUserText,
    actionDesigner: preliminaryActionDesigner,
  });
  const fullTools = selectChatTools({
    chatMode,
    enabledToolIds: effectiveEnabledTools,
    titleTest,
    benchMode,
    userText: lastUserText,
    actionScope: preliminaryActionScope,
    actionDesigner: preliminaryActionDesigner,
  });
  const fullSchemaToolIds = new Set(preliminaryTurnPlan.fullSchemaToolIds);
  const modelTools = slimToolsForModel(fullTools, fullSchemaToolIds);

  let slashTextApplied = false;
  const messagesForModel: AgentUIMessage[] = repairedMessages.map((message) => {
    if (message.role !== "user") return message;
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (!isTextUIPart(part)) return part;
        let text = expandUserMessageForModel(part.text);
        if (
          !slashTextApplied
          && slashCommand.expandedUserText
          && parseSlashCommandInput(expandSlashTagsInUserText(part.text).trim())
        ) {
          slashTextApplied = true;
          text = slashCommand.expandedUserText;
        }
        return { ...part, text };
      }),
    };
  });

  const llmSelectionRaw =
    (body.llmSelection ?? body.llmProvider)?.trim() || undefined;
  const threadId = body.threadId;

  clearProgramTurnFlagsForThread(threadId);

  return runWithAgentRequestContextAsync(
    { cwd, chatMode, lastUserText, llmSelectionRaw, benchMode },
    async () => {
      let actionScope = extractActionScopeFromMessages(messagesForModel);
      const actionDesigner = resolveActionDesignerForChatTurn(body);
      let designerEmbedBlock = "";

      if (actionDesigner && chatMode !== CHAT_MODE_LAUNCHER) {
        const designerSnapshot = await fetchDesignerContextSnapshot(false);
        const windowContext = resolveDesignerWindowContext(designerSnapshot, {
          scoped: body.designerEmbedScoped === true,
          entityId: actionDesigner.entityId,
          isSubProgram: actionDesigner.isSubProgram,
        });
        designerEmbedBlock = formatDesignerEmbedContextForSystem(
          actionDesigner,
          windowContext,
        );
        actionScope = mergeDesignerDefaultActionScope(
          actionScope,
          actionDesigner,
          windowContext?.title,
        );
      }

      return runWithAgentRequestContextAsync(
        toolExecutionContextToAgentRequest(
          buildToolExecutionContext({
            cwd,
            chatMode,
            actionScope,
            threadId,
            lastUserText,
            llmSelectionRaw,
          }),
        ),
        async () => {
          const contextLimit = resolveModelContextLimit(modelId).tokens;
          const compressionBase = {
            messages: messagesForModel,
            model,
            contextLimit,
            usageTracking: {
              selection,
              modelId,
            },
          } as const;
          const preparedContext = await prepareContextPipeline({
            ...compressionBase,
            threadId,
            reinjectRecentPatches: buildPostCompactReinjectBlock,
            force:
              process.env.NODE_ENV !== "production"
              && body.contextCompressionForce === true,
          });

          const turnPlan = resolveTurnPlan({
            actionScope,
            chatMode,
            enabledToolIds: Object.keys(fullTools),
            messages: repairedMessages,
            userText: lastUserText,
            actionDesigner,
          });

          const runtimeSnapshot = buildAgentRuntimeSnapshot({
            actionScope,
            chatMode,
            enabledToolIds: Object.keys(fullTools),
            messages: repairedMessages,
            userText: lastUserText,
            turnPlan,
          });

          const buildSystemForPreparedContext = await createChatSystemBuilder({
            actionScope,
            chatMode,
            cwd,
            designerEmbedBlock: designerEmbedBlock || undefined,
            enabledToolIds: Object.keys(fullTools),
            launcherUserText: lastUserText,
            modelId,
            repairedMessages,
            runtimeSnapshot,
            slashCommandName: slashCommand.commandName,
            titleManual: body.titleManual === true,
            titleTest,
            benchMode,
          });

          const stream = createUIMessageStream<AgentUIMessage>({
            originalMessages: repairedMessages,
            execute: async ({ writer }) => {
              await runAgentStreamLoop({
                writer,
                model,
                modelId,
                contextLimit,
                tools: modelTools,
                chatMode,
                titleTest,
                selection,
                compressionBase: {
                  ...compressionBase,
                  threadId,
                },
                preparedContext,
                buildSystemForPreparedContext,
                runtimeSnapshot,
              });
            },
          });

          return createUIMessageStreamResponse({ stream });
        },
      );
    },
  );
}
