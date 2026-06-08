import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_QUESTION_TOOL,
  buildAskQuestionToolOutput,
  collectPendingAskQuestions,
  countPendingAskQuestions,
  parseAskQuestionInput,
  parseAskQuestionOutputData,
  summarizeAskQuestionOutput,
} from "./ask-question-tool";
import type { AgentUIMessage } from "@/lib/chat-types";

describe("ask-question-tool", () => {
  it("parses valid input", () => {
    const input = {
      title: "选择目标页",
      questions: [
        {
          id: "page",
          prompt: "动作要放在哪一页？",
          options: [
            { id: "global", label: "全局页" },
            { id: "new", label: "新建页" },
          ],
        },
      ],
    };
    assert.deepEqual(parseAskQuestionInput(input), input);
  });

  it("builds and summarizes output", () => {
    const output = buildAskQuestionToolOutput({
      page: { optionIds: ["global"], labels: ["全局页"] },
    });
    const data = parseAskQuestionOutputData(output);
    assert.equal(data?.action, ASK_QUESTION_TOOL);
    assert.deepEqual(data?.answers.page, {
      optionIds: ["global"],
      labels: ["全局页"],
    });
    assert.equal(summarizeAskQuestionOutput(output), "全局页");
  });

  it("counts pending ask_question parts", () => {
    const messages: AgentUIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: `tool-${ASK_QUESTION_TOOL}`,
            toolCallId: "tc1",
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
      },
    ];
    assert.equal(countPendingAskQuestions(messages), 1);
    const pending = collectPendingAskQuestions(messages);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.toolCallId, "tc1");
    assert.equal(pending[0]?.input.questions[0]?.id, "q1");
  });
});
