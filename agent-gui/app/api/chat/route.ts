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
import { resolveChatModelForRequest } from "@/lib/llm";
import { isLlmProviderHidden } from "@/lib/llm-config";
import { parseLlmProviderId } from "@/lib/llm-providers";
import { isUserModelSelectorProvider } from "@/lib/llm-user-providers";
import { pickEnabledTools } from "@/lib/tool-registry";
import { quickerTools } from "@/lib/tools";
import { expandUserMessageForModel } from "@/lib/compose-user-message";
import { isTextUIPart } from "ai";
import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import { prepareCompressedContext } from "@/lib/context-compression";
import { repairInterruptedToolCalls } from "@/lib/repair-interrupted-tool-calls";

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
  }: {
    messages: AgentUIMessage[];
    enabledTools?: string[];
    workingDirectory?: string;
    /** @deprecated use workingDirectory */
    workspaceRoot?: string;
    llmProvider?: string;
  } = await req.json();

  const providerOverride = parseLlmProviderId(llmProvider);

  if (
    providerOverride
    && (!isUserModelSelectorProvider(providerOverride)
      || isLlmProviderHidden(providerOverride))
  ) {
    return Response.json(
      { error: `Provider "${providerOverride}" is not available` },
      { status: 400 },
    );
  }

  let model;
  let modelId: string;
  try {
    ({ model, modelId } = await resolveChatModelForRequest(providerOverride));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }

  const tools = pickEnabledTools(quickerTools, enabledTools);
  const cwd = (workingDirectory ?? workspaceRoot)?.trim() || undefined;

  const repairedMessages = repairInterruptedToolCalls(messages);

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
    });

    const scopeBlock = formatActionScopeForSystem(actionScope);
    const baseSystem = await buildSystemInstructions(cwd);
    const systemWithScope = scopeBlock
      ? `${baseSystem}\n\n${scopeBlock}`
      : baseSystem;
    const system = preparedContext.systemSuffix
      ? `${systemWithScope}\n\n${preparedContext.systemSuffix}`
      : systemWithScope;
    const result = streamText({
      model,
      system,
      messages: preparedContext.modelMessages,
      tools,
      stopWhen: stepCountIs(25),
    });

    return result.toUIMessageStreamResponse({
      originalMessages: repairedMessages,
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
