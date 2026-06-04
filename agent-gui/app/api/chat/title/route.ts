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
  deriveProvisionalThreadTitle,
  extractTitleConversationText,
  sanitizeThreadTitle,
  THREAD_TITLE_SYSTEM_PROMPT,
} from "@/lib/thread-title";

export const maxDuration = 30;

export async function POST(req: Request) {
  const {
    messages,
    llmProvider,
    llmSelection,
  }: {
    messages?: AgentUIMessage[];
    llmProvider?: string;
    llmSelection?: string;
  } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ title: "新对话" });
  }

  const provisional = deriveProvisionalThreadTitle(messages);
  const context = extractTitleConversationText(messages);
  if (!context.trim()) {
    return Response.json({ title: provisional });
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
    const { result } = await runLlmWithSelectionFallback(
      llmSelection ?? llmProvider,
      parseLlmProviderId(llmProvider),
      async (model) => generateText({
        model,
        system: THREAD_TITLE_SYSTEM_PROMPT,
        prompt: context,
        maxOutputTokens: 128,
        temperature: 0.2,
      }),
    );

    const generated = sanitizeThreadTitle(result.text);
    const title =
      generated === "新对话" && provisional !== "新对话"
        ? provisional
        : generated;
    return Response.json({ title });
  } catch (e) {
    console.warn("[/api/chat/title]", e);
    return Response.json({
      title: provisional,
      warning: e instanceof Error ? e.message : String(e),
    });
  }
}
