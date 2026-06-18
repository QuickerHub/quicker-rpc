import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  stepCountIs,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { extractActionScopeFromMessages } from "@/lib/action-scope";
import { resolveEffectiveWorkingDirectory } from "@/lib/default-working-directory";
import { runWithAgentRequestContextAsync } from "@/lib/qkrpc-request-context";
import {
  isLlmSelectionConfigured,
  resolveChatModelForSelection,
  resolveLlmSelection,
} from "@/lib/llm";
import { isLlmProviderHidden } from "@/lib/llm-config";
import { parseLlmProviderId } from "@/lib/llm-providers";
import {
  CHAT_MODE_LAUNCHER,
  maxStepsForChatMode,
  resolveChatMode,
  resolveEnabledToolsForChatMode,
} from "@/lib/chat-mode";
import { defaultEnabledToolIds } from "@/lib/tool-registry";
import { expandUserMessageForModel } from "@/lib/compose-user-message";
import { isTextUIPart } from "ai";
import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import { prepareCompressedContext } from "@/lib/context-compression";
import { buildPostCompactReinjectBlock } from "@/lib/context-compaction-reinject.server";
import { mergeUIMessageStreamWithReactiveCompact } from "@/lib/context-compression-reactive";
import { repairInterruptedToolCalls } from "@/lib/repair-interrupted-tool-calls";
import { recordManagedLlmUsageAsync } from "@/lib/llm-usage-tracker.server";
import { withReleasePreviewRoute } from "@/lib/release-preview.server";
import {
  extractLastUserMessageText,
} from "@/lib/launcher/launcher-command-cache.server";
import { tryRespondWithLauncherCacheDirect } from "@/lib/launcher/launcher-cache-direct.server";
import { tryRespondWithLauncherResolveDirect } from "@/lib/launcher/launcher-resolve-direct.server";
import { createRepairToolCallHandler } from "@/lib/repair-tool-call";
import { parseSlashCommandInput } from "@/lib/agent-defs/command-expand";
import { expandSlashTagsInUserText } from "@/lib/composer-slash-tag";
import { resolveSlashCommandForChat } from "@/lib/agent-defs/apply-chat-command.server";
import {
  createChatSystemBuilder,
  selectChatTools,
} from "@/lib/agent-turn-runtime";
import { buildAgentRuntimeSnapshot } from "@/lib/agent-runtime-snapshot";
import { fetchDesignerContextSnapshot } from "@/lib/designer-context.server";
import { resolveDesignerWindowContext } from "@/lib/designer-embed-layout";
import {
  formatDesignerEmbedContextForSystem,
  mergeDesignerDefaultActionScope,
  parseActionDesignerChatContext,
} from "@/lib/designer-embed-prompt";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    return await withReleasePreviewRoute(() => handleChatPost(req));
  } catch (e) {
    console.error("[/api/chat]", e);
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handleChatPost(req: Request) {
  const {
    messages,
    enabledTools,
    workingDirectory,
    workspaceRoot,
    llmProvider,
    llmSelection,
    titleManual,
    titleTestOnly,
    chatMode: chatModeRaw,
    contextCompressionForce,
    threadId: _threadId,
    actionDesigner: actionDesignerRaw,
  }: {
    messages: AgentUIMessage[];
    enabledTools?: string[];
    workingDirectory?: string;
    /** @deprecated use workingDirectory */
    workspaceRoot?: string;
    /** @deprecated use llmSelection */
    llmProvider?: string;
    llmSelection?: string;
    titleManual?: boolean;
    /** Tool-test: production title path via set_thread_title only. */
    titleTestOnly?: boolean;
    /** Tool-test dev: force context compression when splitIndex > 0. */
    contextCompressionForce?: boolean;
    /** agent = full authoring; launcher = quick commands (fixed tools + prompt). */
    chatMode?: string;
    /** Active thread id (reserved). */
    threadId?: string;
    /** Action Designer embed: default program to edit in this chat. */
    actionDesigner?: { entityId: string; isSubProgram?: boolean };
  } = await req.json();

  const chatMode = resolveChatMode(chatModeRaw);
  const cwd = resolveEffectiveWorkingDirectory(workingDirectory ?? workspaceRoot);
  const repairedMessages = repairInterruptedToolCalls(messages);
  const titleTest = titleTestOnly === true;

  const resolvedEnabledTools = resolveEnabledToolsForChatMode(
    chatMode,
    enabledTools,
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
      ?? llmSelection
      ?? llmProvider,
    parseLlmProviderId(llmProvider),
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
  const tools = selectChatTools({
    chatMode,
    enabledToolIds: effectiveEnabledTools,
    titleTest,
  });
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

  const llmSelectionRaw = (llmSelection ?? llmProvider)?.trim() || undefined;

  return runWithAgentRequestContextAsync(
    { cwd, chatMode, lastUserText, llmSelectionRaw },
    async () => {
    let actionScope = extractActionScopeFromMessages(messagesForModel);
    const actionDesigner = parseActionDesignerChatContext(actionDesignerRaw);
    let designerEmbedBlock = "";

    if (actionDesigner && chatMode !== CHAT_MODE_LAUNCHER) {
      const designerSnapshot = await fetchDesignerContextSnapshot(false);
      const windowContext = resolveDesignerWindowContext(designerSnapshot, {
        scoped: true,
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
      { cwd, actionScope, chatMode, lastUserText, llmSelectionRaw },
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
    let preparedContext = await prepareCompressedContext({
      ...compressionBase,
      reinjectRecentPatches: buildPostCompactReinjectBlock,
      force:
        process.env.NODE_ENV !== "production"
        && contextCompressionForce === true,
    });

    const runtimeSnapshot = buildAgentRuntimeSnapshot({
      actionScope,
      chatMode,
      enabledToolIds: Object.keys(tools),
      messages: repairedMessages,
      userText: lastUserText,
    });

    const buildSystemForPreparedContext = await createChatSystemBuilder({
      actionScope,
      chatMode,
      cwd,
      designerEmbedBlock: designerEmbedBlock || undefined,
      enabledToolIds: Object.keys(tools),
      launcherUserText: lastUserText,
      modelId,
      repairedMessages,
      runtimeSnapshot,
      titleManual: titleManual === true,
      titleTest,
    });

    const stream = createUIMessageStream<AgentUIMessage>({
      originalMessages: repairedMessages,
      execute: async ({ writer }) => {
        let reactiveCompactAttempted = false;

        while (true) {
          const system = buildSystemForPreparedContext(preparedContext);
          const result = streamText({
            model,
            system,
            messages: preparedContext.modelMessages,
            tools,
            experimental_repairToolCall: createRepairToolCallHandler(tools),
            stopWhen: stepCountIs(titleTest ? 3 : maxStepsForChatMode(chatMode)),
            onFinish: ({ totalUsage }) => {
              recordManagedLlmUsageAsync({
                selection,
                modelId,
                source: "chat",
                inputTokens: totalUsage.inputTokens,
                outputTokens: totalUsage.outputTokens,
                totalTokens: totalUsage.totalTokens,
                reasoningTokens: totalUsage.reasoningTokens,
              });
            },
          });

          const uiStream = result.toUIMessageStream<AgentUIMessage>({
            sendReasoning: true,
            messageMetadata: ({ part }) => {
              if (part.type === "start") {
                return {
                  model: modelId,
                  contextCompression: preparedContext.contextCompression,
                  agentTurnState: runtimeSnapshot.turnState,
                  recoveryDecision: runtimeSnapshot.recoveryDecision,
                  recentToolFeedbackCount:
                    runtimeSnapshot.recentToolFeedbackCount,
                };
              }
              if (part.type === "finish-step" && part.usage) {
                const u = part.usage;
                return {
                  model: modelId,
                  inputTokens: u.inputTokens,
                  outputTokens: u.outputTokens,
                  totalTokens: u.totalTokens,
                  reasoningTokens: u.reasoningTokens,
                };
              }
              if (part.type === "finish") {
                return { model: modelId };
              }
              return undefined;
            },
          });

          const mergeResult = await mergeUIMessageStreamWithReactiveCompact(
            uiStream.getReader(),
            writer,
            { allowReactiveRetry: !reactiveCompactAttempted },
          );

          if (mergeResult.action === "retry") {
            reactiveCompactAttempted = true;
            void result.consumeStream({ onError: () => {} });
            preparedContext = await prepareCompressedContext({
              ...compressionBase,
              force: true,
              reactiveCompactAttempted: true,
              reinjectRecentPatches: buildPostCompactReinjectBlock,
            });
            continue;
          }

          break;
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
    });
  });
}
