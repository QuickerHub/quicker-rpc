import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AgentUIMessage } from "@/lib/chat-types";
import {
  extractAssistantText,
  extractLastActionId,
  extractToolTrace,
} from "@/lib/agent-eval/trace-extract";

describe("agent-eval trace-extract", () => {
  it("extracts ordered tool calls from assistant parts", () => {
    const messages: AgentUIMessage[] = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-qkrpc_step_runner_search",
            toolCallId: "tc1",
            state: "output-available",
            input: { query: "expr" },
            output: { ok: true },
          },
          {
            type: "tool-qkrpc_step_runner_get",
            toolCallId: "tc2",
            state: "output-available",
            input: { key: "sys:evalexpression" },
            output: { ok: true },
          },
        ],
      },
    ];

    const trace = extractToolTrace(messages);
    assert.equal(trace.length, 2);
    assert.equal(trace[0]?.toolName, "qkrpc_step_runner_search");
    assert.equal(trace[1]?.toolName, "qkrpc_step_runner_get");
  });

  it("extracts assistant text and last action id", () => {
    const messages: AgentUIMessage[] = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Created action 65a3b800-f5be-4a2b-ac03-5c9a27f4e71d",
          },
        ],
      },
    ];
    assert.ok(extractAssistantText(messages).includes("Created action"));
    assert.equal(
      extractLastActionId(extractAssistantText(messages)),
      "65a3b800-f5be-4a2b-ac03-5c9a27f4e71d",
    );
  });
});
