import {
  convertToModelMessages,
  streamText,
  stepCountIs,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { buildSystemInstructions } from "@/lib/instructions";
import { runWithQkrpcCwd } from "@/lib/qkrpc-request-context";
import { getChatModelId, resolveChatModel } from "@/lib/llm";
import { parseLlmProviderId } from "@/lib/llm-providers";
import { pickEnabledTools } from "@/lib/tool-registry";
import { quickerTools } from "@/lib/tools";
import { expandUserMessageForModel } from "@/lib/compose-user-message";
import { isTextUIPart } from "ai";

export const maxDuration = 120;

export async function POST(req: Request) {
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

  let model;
  try {
    model = resolveChatModel(providerOverride);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }

  const modelId = getChatModelId(providerOverride);
  const tools = pickEnabledTools(quickerTools, enabledTools);
  const cwd = (workingDirectory ?? workspaceRoot)?.trim() || undefined;

  const messagesForModel: AgentUIMessage[] = messages.map((message) => {
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

  const modelMessages = await convertToModelMessages(messagesForModel);

  return runWithQkrpcCwd(cwd, () => {
    const result = streamText({
      model,
      system: buildSystemInstructions(cwd),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(25),
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          return { model: modelId };
        }
        if (part.type === "finish") {
          const u = part.totalUsage;
          return {
            model: modelId,
            inputTokens: u.inputTokens,
            outputTokens: u.outputTokens,
            totalTokens: u.totalTokens,
            reasoningTokens: u.reasoningTokens,
          };
        }
        return undefined;
      },
    });
  });
}
