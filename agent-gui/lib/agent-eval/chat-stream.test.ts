import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AgentUIMessage } from "@/lib/chat-types";
import { parseAgentGuiChatStream } from "@/lib/agent-eval/chat-stream";

function sseBody(lines: string[]): string {
  return lines.map((line) => (line === "" ? "" : `data: ${line}`)).join("\n\n");
}

describe("agent-eval chat-stream", () => {
  it("returns ok:false and error text for stream error chunks without unhandled rejection", async () => {
    const seed: AgentUIMessage = {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "/list-actions 5" }],
    };

    const body = sseBody([
      JSON.stringify({
        type: "start",
        messageId: "msg-1",
        messageMetadata: { model: "test-model" },
      }),
      JSON.stringify({ type: "error", errorText: "Gone" }),
      "[DONE]",
    ]);

    const parsed = await parseAgentGuiChatStream(body, seed);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.error, "Gone");
    assert.ok(parsed.messages.some((m) => m.role === "user"));
  });

  it("collects assistant text from a minimal finish stream", async () => {
    const body = sseBody([
      JSON.stringify({ type: "start", messageId: "msg-2" }),
      JSON.stringify({ type: "text-start", id: "t1" }),
      JSON.stringify({ type: "text-delta", id: "t1", delta: "hello" }),
      JSON.stringify({ type: "text-end", id: "t1" }),
      JSON.stringify({ type: "finish", finishReason: "stop" }),
      "[DONE]",
    ]);

    const parsed = await parseAgentGuiChatStream(body);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.messages.length, 1);
    assert.equal(parsed.messages[0]?.role, "assistant");
  });
});
