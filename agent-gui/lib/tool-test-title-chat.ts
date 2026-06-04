import type { AgentUIMessage } from "@/lib/chat-types";
import { aggregateSessionUsage } from "@/lib/chat-types";
import { extractThreadTitleFromMessages } from "@/lib/thread-title-tool-messages";
import type { TitleTestApiResult } from "@/lib/tool-test-title";

export function buildTitleTestResultFromChatMessages(
  messages: AgentUIMessage[],
  opts?: { aborted?: boolean; error?: string },
): TitleTestApiResult {
  const title = extractThreadTitleFromMessages(messages);
  const usageAgg = aggregateSessionUsage(messages);
  let modelId: string | undefined;
  for (const message of messages) {
    if (message.role === "assistant" && message.metadata?.model) {
      modelId = message.metadata.model;
    }
  }

  const usage =
    usageAgg.inputTokens + usageAgg.outputTokens > 0
      ? {
          inputTokens: usageAgg.inputTokens,
          outputTokens: usageAgg.outputTokens,
          totalTokens: usageAgg.totalTokens,
        }
      : undefined;

  if (opts?.error) {
    return {
      title: title ?? "新对话",
      source: "chat",
      modelId,
      usage,
      error: opts.error,
      warning: opts.aborted ? "已中止对话（拿到标题后停止）" : undefined,
    };
  }

  if (!title) {
    return {
      title: "新对话",
      source: "chat",
      modelId,
      usage,
      error: "未调用 set_thread_title 或工具未完成",
      warning: opts?.aborted ? "已中止对话" : undefined,
    };
  }

  return {
    title,
    source: "chat",
    modelId,
    usage,
    warning: opts?.aborted ? "已中止对话（拿到标题后停止）" : undefined,
  };
}
