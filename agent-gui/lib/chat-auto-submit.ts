import type { UIMessage } from "ai";
import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";

/** Resume chat after approval responses or client-side tool outputs (e.g. ask_question). */
export function lastAssistantMessageIsCompleteWithClientResponses(input: {
  messages: UIMessage[];
}): boolean {
  return (
    lastAssistantMessageIsCompleteWithApprovalResponses(input)
    || lastAssistantMessageIsCompleteWithToolCalls(input)
  );
}
