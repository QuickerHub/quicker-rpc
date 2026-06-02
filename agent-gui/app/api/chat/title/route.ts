import { generateText } from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";
import { resolveChatModel } from "@/lib/llm";
import { isLlmProviderHidden } from "@/lib/llm-config";
import { parseLlmProviderId } from "@/lib/llm-providers";
import { isUserModelSelectorProvider } from "@/lib/llm-user-providers";
import {
  extractTitleConversationText,
  sanitizeThreadTitle,
  THREAD_TITLE_SYSTEM_PROMPT,
} from "@/lib/thread-title";

export const maxDuration = 30;

export async function POST(req: Request) {
  const {
    messages,
    llmProvider,
  }: {
    messages?: AgentUIMessage[];
    llmProvider?: string;
  } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ title: "新对话" });
  }

  const context = extractTitleConversationText(messages);
  if (!context.trim()) {
    return Response.json({ title: "新对话" });
  }

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
  try {
    model = resolveChatModel(providerOverride);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }

  try {
    const { text } = await generateText({
      model,
      system: THREAD_TITLE_SYSTEM_PROMPT,
      prompt: context,
      maxOutputTokens: 40,
      temperature: 0.2,
    });

    return Response.json({ title: sanitizeThreadTitle(text) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
