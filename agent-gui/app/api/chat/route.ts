import {
  streamText,
  stepCountIs,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { buildSystemInstructions } from "@/lib/instructions";
import {
  extractActionScopeFromMessages,
  formatActionScopeForSystem,
} from "@/lib/action-scope";
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
import { defaultEnabledToolIds, pickChatTools } from "@/lib/tool-registry";
import {
  SET_THREAD_TITLE_TOOL,
  buildThreadTitleAgentInstruction,
  buildTitleTestChatInstruction,
} from "@/lib/set-thread-title-tool";
import { quickerTools } from "@/lib/tools";
import { expandUserMessageForModel } from "@/lib/compose-user-message";
import { isTextUIPart } from "ai";
import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import { prepareCompressedContext } from "@/lib/context-compression";
import { repairInterruptedToolCalls } from "@/lib/repair-interrupted-tool-calls";
import { recordManagedLlmUsageAsync } from "@/lib/llm-usage-tracker.server";
import { withReleasePreviewRoute } from "@/lib/release-preview.server";
import {
  buildLauncherCommandCachePromptBlock,
  extractLastUserMessageText,
} from "@/lib/launcher/launcher-command-cache.server";
import { tryRespondWithLauncherCacheDirect } from "@/lib/launcher/launcher-cache-direct.server";
import { tryRespondWithLauncherResolveDirect } from "@/lib/launcher/launcher-resolve-direct.server";
import { createRepairToolCallHandler } from "@/lib/repair-tool-call";
import { parseSlashCommandInput } from "@/lib/agent-defs/command-expand";
import { expandSlashTagsInUserText } from "@/lib/composer-slash-tag";
import {
  formatUserLanguageForSystem,
  inferUserReplyLanguageFromMessages,
} from "@/lib/user-reply-language";
import { resolveSlashCommandForChat } from "@/lib/agent-defs/apply-chat-command.server";
import { formatChatRuntimeContext } from "@/lib/agent-runtime-context";

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
  const tools = titleTest
    ? { [SET_THREAD_TITLE_TOOL]: quickerTools[SET_THREAD_TITLE_TOOL] }
    : pickChatTools(quickerTools, effectiveEnabledTools, [
        ...(chatMode === "launcher" ? [] : [SET_THREAD_TITLE_TOOL]),
      ]);
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
    const actionScope = extractActionScopeFromMessages(messagesForModel);

    return runWithAgentRequestContextAsync(
      { cwd, actionScope, chatMode, lastUserText, llmSelectionRaw },
      async () => {
    const contextLimit = resolveModelContextLimit(modelId).tokens;
    const preparedContext = await prepareCompressedContext({
      messages: messagesForModel,
      model,
      contextLimit,
      force:
        process.env.NODE_ENV !== "production"
        && contextCompressionForce === true,
      usageTracking: {
        selection,
        modelId,
      },
    });

    const scopeBlock = formatActionScopeForSystem(actionScope);
    const baseSystem = await buildSystemInstructions(cwd, chatMode);
    const replyLanguage = inferUserReplyLanguageFromMessages(repairedMessages);
    const replyLanguageBlock = replyLanguage
      ? formatUserLanguageForSystem(replyLanguage)
      : null;
    const runtimeContextBlock = formatChatRuntimeContext({
      mode: chatMode,
      cwd,
      modelId,
      enabledToolIds: Object.keys(tools),
    });
    const launcherCacheBlock =
      chatMode === CHAT_MODE_LAUNCHER
        ? await buildLauncherCommandCachePromptBlock(lastUserText)
        : undefined;
    const systemWithScope = scopeBlock
      ? `${baseSystem}\n\n${scopeBlock}`
      : baseSystem;
    const titleInstruction = titleTest
      ? buildTitleTestChatInstruction()
      : chatMode === "launcher"
        ? null
        : buildThreadTitleAgentInstruction({
            messages: repairedMessages,
            titleManual: titleManual === true,
          });
    const system = [
      titleTest
        ? "You are running in title-test mode for Quicker Agent GUI (/tool-test)."
        : null,
      systemWithScope,
      runtimeContextBlock,
      replyLanguageBlock,
      launcherCacheBlock,
      titleInstruction,
      preparedContext.systemSuffix,
    ]
      .filter((block): block is string => Boolean(block?.trim()))
      .join("\n\n");
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

    return result.toUIMessageStreamResponse({
      originalMessages: repairedMessages,
      sendReasoning: true,
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          return {
            model: modelId,
            contextCompression: preparedContext.contextCompression,
          };
        }
        // Per-step usage (last finish-step wins). Do not use finish.totalUsage — it sums all tool steps.
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
        // finish has totalUsage only (sums all tool steps); per-step usage comes from finish-step above.
        if (part.type === "finish") {
          return { model: modelId };
        }
        return undefined;
      },
    });
    });
  });
}
