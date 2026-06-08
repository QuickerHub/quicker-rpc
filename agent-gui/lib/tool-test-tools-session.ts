import type { AgentUIMessage } from "@/lib/chat-types";
import type { ToolSuiteRunEntry } from "@/lib/tool-test-suite-runs";

export const TOOL_TEST_SESSION_RUN_ID = "tool-test-session";
export const TOOL_TEST_SESSION_ASSISTANT_ID = "tool-test-session-assistant";

export function createEmptyToolTestSession(): ToolSuiteRunEntry {
  return {
    id: TOOL_TEST_SESSION_RUN_ID,
    at: Date.now(),
    suiteId: "session",
    suiteTitle: "Tools",
    status: "done",
    chatMessages: [
      {
        id: TOOL_TEST_SESSION_ASSISTANT_ID,
        role: "assistant",
        parts: [],
      },
    ],
  };
}

export function findToolTestSession(
  runs: readonly ToolSuiteRunEntry[],
): ToolSuiteRunEntry | undefined {
  return runs.find((run) => run.id === TOOL_TEST_SESSION_RUN_ID);
}

export function getToolTestSessionParts(
  run: ToolSuiteRunEntry,
): AgentUIMessage["parts"] {
  const assistant = run.chatMessages.find(
    (m) => m.id === TOOL_TEST_SESSION_ASSISTANT_ID,
  );
  return assistant?.parts ?? [];
}
