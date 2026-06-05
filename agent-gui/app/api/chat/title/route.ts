import { generateText } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  isLlmSelectionConfigured,
  resolveLlmSelection,
  runLlmWithSelectionFallback,
} from "@/lib/llm";
import { isLlmProviderHidden } from "@/lib/llm-config";
import { parseLlmProviderId } from "@/lib/llm-providers";
import {
  buildTitleRequestPayload,
  deriveProvisionalThreadTitle,
  extractTitleConversationText,
  extractUserLineFromTitleContext,
  fallbackCompressTitleFromUserLine,
  isNearVerbatimThreadTitle,
  isProvisionalTitleSufficient,
  sanitizeThreadTitle,
  THREAD_TITLE_RETRY_SYSTEM_PROMPT,
  THREAD_TITLE_RETRY_USER_PROMPT_SUFFIX,
  THREAD_TITLE_SYSTEM_PROMPT,
} from "@/lib/thread-title";
import { recordManagedLlmUsageAsync } from "@/lib/llm-usage-tracker.server";

export const maxDuration = 30;

export async function POST(req: Request) {
  const {
    messages,
    context: contextBody,
    provisional: provisionalBody,
    llmProvider,
    llmSelection,
    forceLlm,
    testMode,
  }: {
    messages?: AgentUIMessage[];
    context?: string;
    provisional?: string;
    llmProvider?: string;
    llmSelection?: string;
    /** @deprecated Prefer testMode for tool-test page. */
    forceLlm?: boolean;
    /** Tool-test: always invoke title model; return token usage. */
    testMode?: boolean;
  } = await req.json();

  const fromMessages =
    Array.isArray(messages) && messages.length > 0
      ? buildTitleRequestPayload(messages)
      : null;

  const provisional = (
    typeof provisionalBody === "string"
      ? provisionalBody.trim()
      : fromMessages?.provisional
  ) ?? (fromMessages ? fromMessages.provisional : deriveProvisionalThreadTitle(messages ?? []));

  const context = (
    typeof contextBody === "string"
      ? contextBody.trim()
      : fromMessages?.context
  ) ?? (fromMessages ? fromMessages.context : extractTitleConversationText(messages ?? []));

  if (!context) {
    return Response.json({ title: provisional || "新对话" });
  }

  const alwaysCallModel = testMode === true || forceLlm === true;
  if (!alwaysCallModel && isProvisionalTitleSufficient(provisional)) {
    return Response.json({ title: provisional, source: "provisional" });
  }

  const selection = resolveLlmSelection(
    llmSelection ?? llmProvider,
    parseLlmProviderId(llmProvider),
  );
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
    return Response.json({ title: provisional, warning: "Model not configured" });
  }

  try {
    const userLine = extractUserLineFromTitleContext(context);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const runTitleModel = async (
      system: string,
      prompt: string,
      temperature: number,
    ) => runLlmWithSelectionFallback(
      llmSelection ?? llmProvider,
      parseLlmProviderId(llmProvider),
      async (model) => generateText({
        model,
        system,
        prompt,
        maxOutputTokens: 32,
        temperature,
      }),
    );

    let { result, modelId } = await runTitleModel(
      THREAD_TITLE_SYSTEM_PROMPT,
      context,
      0.2,
    );
    totalInputTokens += result.usage?.inputTokens ?? 0;
    totalOutputTokens += result.usage?.outputTokens ?? 0;

    let generated = sanitizeThreadTitle(result.text);
    if (isNearVerbatimThreadTitle(generated, userLine)) {
      const retry = await runTitleModel(
        THREAD_TITLE_RETRY_SYSTEM_PROMPT,
        userLine
          ? `用户原话：${userLine}\n\n${THREAD_TITLE_RETRY_USER_PROMPT_SUFFIX}`
          : context,
        0.35,
      );
      totalInputTokens += retry.result.usage?.inputTokens ?? 0;
      totalOutputTokens += retry.result.usage?.outputTokens ?? 0;
      modelId = retry.modelId;
      generated = sanitizeThreadTitle(retry.result.text);
    }

    if (isNearVerbatimThreadTitle(generated, userLine) && userLine) {
      generated = fallbackCompressTitleFromUserLine(userLine);
    }

    const title =
      generated === "新对话" && provisional !== "新对话"
        ? provisional
        : generated;

    recordManagedLlmUsageAsync({
      selection,
      modelId,
      source: "title",
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
    });

    return Response.json({
      title,
      source: "llm",
      modelId,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
    });
  } catch (e) {
    console.warn("[/api/chat/title]", e);
    return Response.json({
      title: provisional,
      warning: e instanceof Error ? e.message : String(e),
    });
  }
}
