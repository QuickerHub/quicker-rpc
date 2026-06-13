import type { AgentUIMessage } from "@/lib/chat-types";
import { resolveCompactionUsageThreshold } from "@/lib/context-compression-shared";

export type ContextCompressionScenario = {
  id: string;
  label: string;
  description: string;
  contextLimit: number;
  /** When set, applied to the last assistant message before dry-run / chat. */
  simulatedInputTokens?: number;
  /** Bypass ~90% thresholds (still requires splitIndex > 0). */
  force?: boolean;
  buildMessages: () => AgentUIMessage[];
  /** User message sent after seed thread (chat verification mode). */
  continuePrompt?: string;
};

function userMessage(id: string, text: string): AgentUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function assistantMessage(
  id: string,
  text: string,
  metadata?: AgentUIMessage["metadata"],
): AgentUIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
    metadata,
  };
}

export function buildLongThread(messageCount: number): AgentUIMessage[] {
  const messages: AgentUIMessage[] = [];
  for (let i = 0; i < messageCount; i += 1) {
    if (i % 2 === 0) {
      messages.push(
        userMessage(
          `u-${i}`,
          `Turn ${i}: please remember goal "build clipboard sync" and step ${i}.`,
        ),
      );
    } else {
      messages.push(
        assistantMessage(
          `a-${i}`,
          `Turn ${i}: acknowledged goal clipboard sync; completed sub-step ${i}.`,
        ),
      );
    }
  }
  return messages;
}

export function applySimulatedInputTokens(
  messages: AgentUIMessage[],
  inputTokens: number,
): AgentUIMessage[] {
  const copy = messages.map((message) => ({
    ...message,
    parts: [...message.parts],
    metadata: message.metadata ? { ...message.metadata } : undefined,
  }));
  for (let i = copy.length - 1; i >= 0; i -= 1) {
    const message = copy[i]!;
    if (message.role !== "assistant") continue;
    message.metadata = { ...message.metadata, inputTokens };
    break;
  }
  return copy;
}

export function materializeScenarioMessages(
  scenario: ContextCompressionScenario,
): AgentUIMessage[] {
  let messages = scenario.buildMessages();
  if (scenario.simulatedInputTokens != null && scenario.simulatedInputTokens > 0) {
    messages = applySimulatedInputTokens(
      messages,
      scenario.simulatedInputTokens,
    );
  }
  return messages;
}

export const CONTEXT_COMPRESSION_USAGE_THRESHOLD_128K =
  resolveCompactionUsageThreshold(128_000);

export const CONTEXT_COMPRESSION_SCENARIOS: ContextCompressionScenario[] = [
  {
    id: "threshold-90",
    label: "阈值触发（~90% usage）",
    description:
      "16 轮对话 + 末条 assistant inputTokens≈90% / 128K，应走 LLM 摘要并保留最近 12 条",
    contextLimit: 128_000,
    simulatedInputTokens: CONTEXT_COMPRESSION_USAGE_THRESHOLD_128K,
    buildMessages: () => buildLongThread(16),
    continuePrompt: "用一句话说明：上文摘要里用户最初的目标是什么？",
  },
  {
    id: "reuse-summary",
    label: "复用已有摘要",
    description:
      "线程里已有 contextCompression 元数据，续写时不应再次调用压缩 LLM",
    contextLimit: 128_000,
    simulatedInputTokens: CONTEXT_COMPRESSION_USAGE_THRESHOLD_128K + 1_000,
    buildMessages: () => [
      ...buildLongThread(14),
      assistantMessage("a-summary", "已压缩历史。", {
        inputTokens: CONTEXT_COMPRESSION_USAGE_THRESHOLD_128K + 1_000,
        contextCompression: {
          summary: "User wants clipboard sync; steps 0–10 explored paths and errors.",
          throughMessageId: "u-10",
          sourceInputTokens: CONTEXT_COMPRESSION_USAGE_THRESHOLD_128K,
          createdAt: Date.now(),
          recentMessagesKept: 12,
          totalMessagesAtCreation: 14,
        },
      }),
      userMessage("u-new", "继续：下一步该做什么？"),
    ],
    continuePrompt: "不要重复工具调用，直接回答下一步建议。",
  },
  {
    id: "below-threshold",
    label: "未达阈值（不压缩）",
    description: "短线程 + 低 usage：完整 messages 送模，不 prune、不 summary",
    contextLimit: 128_000,
    simulatedInputTokens: 4_000,
    buildMessages: () => buildLongThread(6),
  },
  {
    id: "force-summarize",
    label: "强制压缩（dev force）",
    description:
      "18 轮但 tokens 不高；勾选 force 时仍摘要旧消息（便于本地验证摘要质量）",
    contextLimit: 128_000,
    force: true,
    buildMessages: () => buildLongThread(18),
  },
];

export function getContextCompressionScenario(
  id: string,
): ContextCompressionScenario | undefined {
  return CONTEXT_COMPRESSION_SCENARIOS.find((item) => item.id === id);
}
