import { streamText } from "ai";
import {
  isLlmSelectionConfigured,
  resolveChatModelForSelection,
  resolveLlmSelection,
} from "@/lib/llm";
import { recordManagedLlmUsageAsync } from "@/lib/llm-usage-tracker.server";
import { withReleasePreviewRoute } from "@/lib/release-preview.server";
import type { VoiceChatTurn } from "@/lib/voice-chat/voice-chat-types";

export const maxDuration = 60;

const VOICE_CHAT_SYSTEM = [
  "你是友好的中文语音助手，正在与用户进行实时口语对话。",
  "回答务必简短自然，每次 1-3 句话，像面对面聊天。",
  "不要使用 markdown、列表、代码块或过长解释。",
  "若用户打断你，下一轮回答应直接接住新话题。",
].join("\n");

type VoiceChatRequest = {
  userText?: string;
  history?: VoiceChatTurn[];
  llmSelection?: string;
};

export async function POST(req: Request) {
  try {
    return await withReleasePreviewRoute(() => handleVoiceChatPost(req));
  } catch (e) {
    console.error("[/api/voice-chat]", e);
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handleVoiceChatPost(req: Request) {
  const body = (await req.json()) as VoiceChatRequest;
  const userText = body.userText?.trim() ?? "";
  if (!userText) {
    return Response.json({ error: "userText is required" }, { status: 400 });
  }

  const selection = resolveLlmSelection(body.llmSelection, undefined);
  if (!isLlmSelectionConfigured(selection)) {
    return Response.json(
      { error: "LLM 未配置，请先在设置中配置模型" },
      { status: 400 },
    );
  }

  const { model, modelId } = await resolveChatModelForSelection(selection);
  const history = Array.isArray(body.history) ? body.history : [];
  const modelMessages = [
    ...history
      .filter(
        (turn) =>
          (turn.role === "user" || turn.role === "assistant")
          && typeof turn.text === "string"
          && turn.text.trim(),
      )
      .map((turn) => ({
        role: turn.role,
        content: turn.text.trim(),
      })),
    { role: "user" as const, content: userText },
  ];

  const result = streamText({
    model,
    system: VOICE_CHAT_SYSTEM,
    messages: modelMessages,
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

  return result.toTextStreamResponse();
}
