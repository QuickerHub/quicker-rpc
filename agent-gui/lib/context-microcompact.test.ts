import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentUIMessage } from "@/lib/chat-types";
import { estimateMessageTokens } from "@/lib/context-token-estimate";
import { microcompactToolOutputs } from "@/lib/context-microcompact";

function user(id: string, text: string): AgentUIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

describe("microcompactToolOutputs", () => {
  it("compacts old round tool output but not recent rounds", () => {
    const messages: AgentUIMessage[] = [
      user("u1", "start"),
      {
        id: "a1",
        role: "assistant",
        parts: [{
          type: "tool-shell_exec",
          toolCallId: "c1",
          state: "output-available",
          input: { command: "echo old" },
          output: { ok: true, stdout: "x".repeat(8000) },
        }],
      },
      user("u2", "mid"),
      {
        id: "a2",
        role: "assistant",
        parts: [{
          type: "tool-shell_exec",
          toolCallId: "c2",
          state: "output-available",
          input: { command: "echo recent" },
          output: { ok: true, stdout: "y".repeat(8000) },
        }],
      },
      user("u3", "continue"),
    ];

    const result = microcompactToolOutputs(messages, {
      splitIndex: 2,
      protectRecentRounds: 2,
    });

    assert.equal(result.applied, true);
    const oldPart = result.messages[1]!.parts[0] as { output?: Record<string, unknown> };
    const recentPart = result.messages[3]!.parts[0] as { output?: Record<string, unknown> };
    assert.equal(oldPart.output?.compact, true);
    assert.notEqual(recentPart.output?.compact, true);
    assert.ok(result.tokensSavedEstimate > 0);
    assert.ok(
      estimateMessageTokens(result.messages[1]!)
      < estimateMessageTokens(messages[1]!),
    );
  });
});
