import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { AgentUIMessage } from "@/lib/chat-types";
import { ASK_QUESTION_TOOL } from "@/lib/ask-question-tool";
import { buildToolTestChatMessagesPatchKey } from "@/lib/tool-test-chat-messages-patch-key";

describe("buildToolTestChatMessagesPatchKey", () => {
  test("changes when ask_question tool state changes", () => {
    const base: AgentUIMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: `tool-${ASK_QUESTION_TOOL}`,
          toolCallId: "call-1",
          state: "input-available",
          input: {
            questions: [
              {
                id: "q1",
                prompt: "Pick one",
                options: [
                  { id: "a", label: "A" },
                  { id: "b", label: "B" },
                ],
              },
            ],
          },
        },
      ],
    };
    const answered: AgentUIMessage = {
      ...base,
      parts: [
        {
          ...base.parts[0]!,
          state: "output-available",
          output: { ok: true, exitCode: 0, source: "local", data: {} },
        },
      ],
    };

    const before = buildToolTestChatMessagesPatchKey([base]);
    const after = buildToolTestChatMessagesPatchKey([answered]);
    assert.notEqual(before, after);
  });
});
