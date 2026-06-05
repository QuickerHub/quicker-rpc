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
import { listWorkspaceActionProjects } from "@/lib/action-explorer-server";
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
import {
  buildLauncherCommandCachePromptBlock,
  extractLastUserMessageText,
} from "@/lib/launcher/launcher-command-cache.server";
import { tryRespondWithLauncherCacheDirect } from "@/lib/launcher/launcher-cache-direct.server";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    return await handleChatPost(req);
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
    /** agent = full authoring; launcher = quick commands (fixed tools + prompt). */
    chatMode?: string;
  } = await req.json();

  const chatMode = resolveChatMode(chatModeRaw);

  const selection = resolveLlmSelection(llmSelection ?? llmProvider, parseLlmProviderId(llmProvider));
  const cwd = (workingDirectory ?? workspaceRoot)?.trim() || undefined;
  const repairedMessages = repairInterruptedToolCalls(messages);
  const titleTest = titleTestOnly === true;

  if (chatMode === CHAT_MODE_LAUNCHER && !titleTest) {
    const direct = await runWithAgentRequestContextAsync({ cwd }, async () =>
      tryRespondWithLauncherCacheDirect({
        userText: extractLastUserMessageText(repairedMessages),
        repairedMessages,
        cwd,
      }),
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

  const resolvedEnabledTools = resolveEnabledToolsForChatMode(
    chatMode,
    enabledTools,
    defaultEnabledToolIds,
  );
  const tools = titleTest
    ? { [SET_THREAD_TITLE_TOOL]: quickerTools[SET_THREAD_TITLE_TOOL] }
    : pickChatTools(quickerTools, resolvedEnabledTools, [
        ...(chatMode === "launcher" ? [] : [SET_THREAD_TITLE_TOOL]),
      ]);
  const messagesForModel: AgentUIMessage[] = repairedMessages.map((message) => {
    if (message.role !== "user") return message;
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (!isTextUIPart(part)) return part;
        return {
          ...part,
          text: expandUserMessageForModel(part.text),
        };
      }),
    };
  });

  return runWithAgentRequestContextAsync({ cwd }, async () => {
    const localProjectIds: string[] = [];
    if (cwd) {
      const listed = await listWorkspaceActionProjects();
      if (listed.ok) {
        for (const project of listed.projects) {
          if (project.actionId) localProjectIds.push(project.actionId);
        }
      }
    }
    const actionScope = extractActionScopeFromMessages(
      messagesForModel,
      localProjectIds,
    );

    return runWithAgentRequestContextAsync({ cwd, actionScope }, async () => {
    const contextLimit = resolveModelContextLimit(modelId).tokens;
    const preparedContext = await prepareCompressedContext({
      messages: messagesForModel,
      model,
      contextLimit,
      usageTracking: {
        selection,
        modelId,
      },
    });

    const scopeBlock = formatActionScopeForSystem(actionScope);
    const baseSystem = await buildSystemInstructions(cwd, chatMode);
    const launcherCacheBlock =
      chatMode === CHAT_MODE_LAUNCHER
        ? await buildLauncherCommandCachePromptBlock(
            extractLastUserMessageText(repairedMessages),
          )
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
