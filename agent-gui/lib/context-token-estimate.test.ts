import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  estimateMessageTokens,
  estimateThreadTokens,
} from "@/lib/context-token-estimate";

function user(id: string, text: string): AgentUIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

describe("estimateMessageTokens", () => {
  it("counts text by char/4", () => {
    const tokens = estimateMessageTokens(user("u1", "a".repeat(400)));
    assert.ok(tokens >= 95 && tokens <= 105);
  });

  it("weights large tool output higher than short text", () => {
    const heavy: AgentUIMessage = {
      id: "a1",
      role: "assistant",
      parts: [{
        type: "tool-shell_exec",
        toolCallId: "c1",
        state: "output-available",
        input: { command: "echo hi" },
        output: { ok: true, stdout: "x".repeat(20_000) },
      }],
    };
    assert.ok(estimateMessageTokens(heavy) > 3000);
  });
});

describe("estimateThreadTokens", () => {
  it("sums messages", () => {
    const total = estimateThreadTokens([
      user("u1", "hello"),
      user("u2", "world"),
    ]);
    assert.ok(total > 0);
  });
});
