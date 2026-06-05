import type { AgentUIMessage } from "@/lib/chat-types";
import type { ToolTestConversationStatus } from "@/lib/tool-test-conversation-run";
import { createTitleTestRunId, formatTitleTestRunTime } from "@/lib/tool-test-title-runs";

export type ToolSuiteRunEntry = {
  id: string;
  at: number;
  suiteId: string;
  suiteTitle: string;
  status: ToolTestConversationStatus;
  chatMessages: AgentUIMessage[];
  error?: string;
};

export function createToolSuiteRunId(): string {
  return createTitleTestRunId();
}

export { formatTitleTestRunTime as formatToolSuiteRunTime };
