import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ModelMessage } from "ai";
import { applySlidingWindowTrim } from "./sliding-window-trim";

function toolResultMessage(output: unknown): ModelMessage {
  return {
    role: "tool",
    content: [{
      type: "tool-result",
      toolCallId: "c1",
      toolName: "Shell",
      output: { type: "json", value: output },
    }],
  };
}

describe("applySlidingWindowTrim", () => {
  it("previews large tool outputs before the protected recent user turns", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "old turn" },
      toolResultMessage({ ok: true, stdout: "a".repeat(8000) }),
      { role: "user", content: "recent turn" },
      toolResultMessage({ ok: true, stdout: "b".repeat(8000) }),
    ];

    const result = applySlidingWindowTrim(messages, {
      recentUserTurns: 1,
      minOutputChars: 1024,
      previewChars: 500,
    });

    assert.equal(result.applied, true);
    const oldPart = result.messages[1]!.content[0] as {
      output?: { value?: Record<string, unknown> };
    };
    const recentPart = result.messages[3]!.content[0] as {
      output?: { value?: Record<string, unknown> };
    };
    assert.equal(oldPart.output?.value?.preview, true);
    assert.notEqual(recentPart.output?.value?.preview, true);
  });
});
