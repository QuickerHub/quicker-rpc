import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { AgentUIMessage } from "@/lib/chat-types";
import { ASK_QUESTION_TOOL } from "@/lib/ask-question-tool";
import {
  launcherAgentRunAcceptsLiveToolOutput,
  launcherAgentRunAwaitingAskQuestion,
} from "@/lib/tool-test-launcher-agent-runs";

function askQuestionMessage(toolCallId: string): AgentUIMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    parts: [
      {
        type: `tool-${ASK_QUESTION_TOOL}`,
        toolCallId,
        state: "input-available",
        input: {
          title: "Pick one",
          questions: [
            {
              id: "q1",
              prompt: "Which action?",
              options: [
                { id: "a", label: "Action A" },
                { id: "b", label: "Action B" },
              ],
            },
          ],
        },
      },
    ],
  };
}

describe("tool-test-launcher-agent-runs ask_question", () => {
  test("launcherAgentRunAwaitingAskQuestion detects pending ask_question", () => {
    const messages: AgentUIMessage[] = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "hi" }] },
      askQuestionMessage("call-1"),
    ];
    assert.equal(launcherAgentRunAwaitingAskQuestion(messages), true);
  });

  test("launcherAgentRunAcceptsLiveToolOutput while awaiting ask_question", () => {
    const messages: AgentUIMessage[] = [
      { id: "user-1", role: "user", parts: [{ type: "text", text: "hi" }] },
      askQuestionMessage("call-1"),
    ];
    assert.equal(
      launcherAgentRunAcceptsLiveToolOutput({
        status: "done",
        chatMessages: messages,
      }),
      true,
    );
  });
});
