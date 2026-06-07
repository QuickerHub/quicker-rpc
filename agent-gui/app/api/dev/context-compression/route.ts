import { NextResponse } from "next/server";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  prepareCompressedContext,
  previewContextCompression,
  type ContextCompressionPreview,
} from "@/lib/context-compression";
import { resolveModelContextLimit } from "@/lib/llm-context-limits";
import { resolveChatModelForSelection, resolveLlmSelection } from "@/lib/llm";
import { LLM_AUTO_SELECTION } from "@/lib/llm-selection";

export const runtime = "nodejs";

type DevContextCompressionRequest = {
  messages?: AgentUIMessage[];
  contextLimit?: number;
  llmSelection?: string;
  force?: boolean;
};

function isAgentMessage(value: unknown): value is AgentUIMessage {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.role === "user" || record.role === "assistant")
    && typeof record.id === "string"
    && Array.isArray(record.parts)
  );
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let body: DevContextCompressionRequest;
  try {
    body = (await req.json()) as DevContextCompressionRequest;
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages)
    ? body.messages.filter(isAgentMessage)
    : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "MISSING_MESSAGES" }, { status: 400 });
  }

  const selection = resolveLlmSelection(
    body.llmSelection?.trim() || LLM_AUTO_SELECTION,
  );
  const force = body.force === true;

  let model;
  let modelId: string;
  try {
    ({ model, modelId } = await resolveChatModelForSelection(selection));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const contextLimit =
    typeof body.contextLimit === "number" && body.contextLimit > 0
      ? body.contextLimit
      : resolveModelContextLimit(modelId).tokens;

  const preview: ContextCompressionPreview = previewContextCompression(
    messages,
    contextLimit,
    { force },
  );

  const reusableBefore = preview.reusableSummary;
  let summarizeCalled = false;

  const prepared = await prepareCompressedContext({
    messages,
    model,
    contextLimit,
    force,
    usageTracking: {
      selection,
      modelId,
    },
    summarizeOlderMessages: async (_languageModel, olderMessages) => {
      summarizeCalled = true;
      const topics = olderMessages
        .slice(0, 6)
        .map((message) => {
          const textPart = message.parts.find((part) => part.type === "text");
          return textPart && "text" in textPart
            ? String(textPart.text).slice(0, 80)
            : "";
        })
        .filter(Boolean)
        .join(" | ");
      return `[dev dry-run summary] ${olderMessages.length} older messages. ${topics}`;
    },
  });

  const reusedSummary =
    Boolean(reusableBefore)
    && prepared.contextCompression?.summary === reusableBefore;

  return NextResponse.json({
    ok: true,
    modelId,
    contextLimit,
    preview,
    compressed: prepared.compressed,
    summary: prepared.contextCompression?.summary ?? null,
    systemSuffix: prepared.systemSuffix ?? null,
    modelMessageCount: prepared.modelMessages.length,
    contextCompression: prepared.contextCompression ?? null,
    reusedSummary,
    summarizeCalled: summarizeCalled && !reusedSummary,
  });
}
