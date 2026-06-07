import type { UIMessage } from "ai";
import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { AgentUIMessage } from "@/lib/chat-types";

/** Server-side launcher cache/resolve direct streams — already fully executed. */
export function isLauncherDirectAssistantMessage(
  message: UIMessage | undefined,
): boolean {
  if (!message || message.role !== "assistant") return false;
  const meta = (message as AgentUIMessage).metadata;
  if (meta?.launcherCacheDirect === true) return true;
  if (meta?.launcherResolveDirect === true) return true;
  const model = meta?.model;
  return model === "launcher-cache" || model === "launcher-resolve";
}

/** Resume chat after approval responses or client-side tool outputs (e.g. ask_question). */
export function lastAssistantMessageIsCompleteWithClientResponses(input: {
  messages: UIMessage[];
}): boolean {
  const last = input.messages[input.messages.length - 1];
  if (isLauncherDirectAssistantMessage(last)) {
    return false;
  }
  return (
    lastAssistantMessageIsCompleteWithApprovalResponses(input)
    || lastAssistantMessageIsCompleteWithToolCalls(input)
  );
}
